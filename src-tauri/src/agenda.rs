use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct OllamaRequest {
    pub model: String,
    pub prompt: String,
    pub stream: bool,
}

#[derive(Deserialize)]
pub struct OllamaResponse {
    pub response: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgendaItem {
    pub id: String,
    pub text: String,
    pub status: String,         // "pending", "answered"
    pub answer: Option<String>, // Latest answer/summary
    pub score: f32,             // 0.0 to 1.0
    pub evidence: Vec<String>,  // Accumulative evidence
    #[serde(skip)]
    pub embedding: Option<Vec<f32>>,
}

#[derive(Serialize)]
pub struct OllamaEmbeddingRequest {
    pub model: String,
    pub prompt: String,
}

#[derive(Deserialize)]
pub struct OllamaEmbeddingResponse {
    pub embedding: Vec<f32>,
}

#[derive(Deserialize)]
struct ScoreResponse {
    #[serde(rename = "match")]
    is_match: bool,
    score: f32,
    new_evidence: Option<String>,
}

pub fn get_embedding(model: &str, text: &str, base_url: &str) -> Result<Vec<f32>, String> {
    let client = reqwest::blocking::Client::new();
    let req = OllamaEmbeddingRequest {
        model: model.to_string(),
        prompt: text.to_string(),
    };

    let url = format!("{}/api/embeddings", base_url.trim_end_matches('/'));
    let resp = client
        .post(url)
        .json(&req)
        .send()
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        let res: OllamaEmbeddingResponse = resp.json().map_err(|e| e.to_string())?;
        Ok(res.embedding)
    } else {
        Err(format!("Ollama embedding failed: {}", resp.status()))
    }
}

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }
    let dot_product: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot_product / (norm_a * norm_b)
}

pub fn score_agenda_items(
    model: &str,
    text: &str,
    items: &mut [AgendaItem],
    embedding_model: Option<&str>,
    similarity_threshold: f32,
    base_url: &str,
    answered_threshold: f32,
) -> Vec<String> {
    let mut updates = Vec::new();

    // 1. Get embedding for current text if possible
    let text_embedding = if let Some(emb_model) = embedding_model {
        get_embedding(emb_model, text, base_url).ok()
    } else {
        None
    };

    let client = reqwest::blocking::Client::new();

    for item in items.iter_mut() {
        if item.status == "answered" && item.score >= answered_threshold {
            continue;
        }

        // 2. Filter by similarity if embeddings available
        if let (Some(text_emb), Some(item_emb)) = (&text_embedding, &item.embedding) {
            let sim = cosine_similarity(text_emb, item_emb);
            // Threshold can be tuned. 0.4 is usually decent for simple overlap in some models,
            // but for "instruction" tuned embeddings it varies.
            // Let's use a conservative threshold to avoid missing things, or just skip if very low.
            if sim < similarity_threshold {
                continue;
            }
            println!("[Agenda] Similarity for '{}': {:.4}", item.text, sim);
        }

        // 3. Prepare Accumulative Prompt
        let evidence_text = if item.evidence.is_empty() {
            "None".to_string()
        } else {
            item.evidence.join("\n- ")
        };

        let prompt = format!(
            "You are a meeting assistant tracking a goal.
            Goal: \"{}\"
            
            Current Completion Score: {:.2} (0.0 to 1.0)
            
            Previous Evidence:
            - {}
            
            New Transcript Segment:
            \"{}\"
            
            Task:
            1. Analyze if the New Transcript Segment MATCHES the Goal.
            2. If it matches, does it provide NEW progress or information?
            3. Estimate the NEW TOTAL completion score (0.0 to 1.0) based on Previous Evidence + New Segment.
            4. Provide a one-sentence summary of the new evidence found (if any).
            
            Return JSON ONLY:
            {{
                \"match\": true/false,
                \"score\": 0.5,
                \"new_evidence\": \"Discussed budget cap.\"
            }}",
            item.text, item.score, evidence_text, text
        );

        let req = OllamaRequest {
            model: model.to_string(),
            prompt,
            stream: false,
        };

        let url = format!("{}/api/generate", base_url.trim_end_matches('/'));
        if let Ok(resp) = client.post(url).json(&req).send() {
            if let Ok(ollama_resp) = resp.json::<OllamaResponse>() {
                let json_str = ollama_resp.response.trim();
                if let Some(start) = json_str.find('{') {
                    if let Some(end) = json_str.rfind('}') {
                        let clean_json = &json_str[start..=end];

                        if let Ok(scored) = serde_json::from_str::<ScoreResponse>(clean_json) {
                            if scored.is_match {
                                if let Some(ev) = scored.new_evidence {
                                    if !ev.is_empty() {
                                        item.evidence.push(ev);
                                    }
                                }
                                item.score = scored.score;
                                if item.score >= 1.0 {
                                    item.status = "answered".to_string();
                                    item.answer = Some("Completed".to_string());
                                } else if item.score > 0.0 {
                                    item.status = "captured".to_string(); // In progress
                                    item.answer =
                                        Some(format!("In Progress ({:.0}%)", item.score * 100.0));
                                }
                                updates.push(item.id.clone());
                                println!(
                                    "[Agenda] Updated goal '{}' -> Score: {:.2}",
                                    item.text, item.score
                                );
                            }
                        }
                    }
                }
            }
        }
    }
    updates
}
