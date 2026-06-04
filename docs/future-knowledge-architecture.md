# Future Knowledge Architecture — GrowLog AI Advisor

> **Status: Planning only. Do not implement yet.**
> This document describes the next phase of the advisor's knowledge system after launch.

---

## Why this matters

The Phase 2 advisor improvements (confidence rubric, diagnostic language, response structure, frost dates) make the advisor safer and more credible. But the advisor still answers entirely from its training data — it has no access to vetted, up-to-date regional guidance. This is the ceiling on how good it can get without a knowledge layer.

---

## 1. Structured Crop Knowledge

**What it is:** A JSON/Markdown knowledge base of crop-specific facts — growth stages, common pests and diseases, harvest indicators, companion plants, Zone-specific timing.

**Schema concept:**
```json
{
  "crop": "tomato",
  "family": "solanaceae",
  "zones": {
    "6b": {
      "sow_indoors": "late March",
      "transplant_after_frost": "mid-May",
      "days_to_harvest": "60–85 depending on variety"
    }
  },
  "growth_stages": [ "seedling", "vegetative", "flowering", "fruiting", "harvest" ],
  "common_problems": [
    {
      "name": "early blight",
      "symptoms": ["dark spots with concentric rings", "yellowing lower leaves"],
      "distinguishers": ["target-ring pattern distinguishes from septoria"],
      "action": "remove affected leaves, improve airflow, consider copper fungicide if severe",
      "source": "Cornell Cooperative Extension"
    }
  ]
}
```

**How the advisor uses it:** When a user mentions a crop + symptom, retrieve the matching problem entry and pass it as additional context. The advisor cites the structured entry rather than its training data.

---

## 2. Pest and Disease Knowledge Base

**What it is:** Structured entries for common vegetable garden pests and diseases, organized by symptom and crop family.

**Key fields per entry:**
- Visual symptoms (text + example photo references)
- Differentiators from look-alike conditions
- Organic, low-risk, and chemical management options (no brand names)
- Regional prevalence by zone
- Source (extension service, USDA, IPM program)

**Implementation note:** Start with the 20 most common problems affecting the crops currently tracked in GrowLog AI. A Google Sheet or JSON file in the repo is sufficient — no vector database needed at this scale.

---

## 3. Regional Extension Resources

**What it is:** A curated list of cooperative extension URLs and resources by state/province, linked to USDA zones.

**Use case:** When the advisor says "check with your local extension service," it can include a direct link. For zone 6b in CT: University of Connecticut Extension.

**Schema concept:**
```json
{
  "region": "Connecticut",
  "usda_zones": ["6a", "6b"],
  "extension_url": "https://extension.uconn.edu/",
  "ipm_program": "https://ipm.uconn.edu/",
  "plant_clinic": "https://plantclinic.uconn.edu/"
}
```

---

## 4. Selective Retrieval (Only at Low/Medium Confidence)

**What it is:** A retrieval step that runs only when the advisor's confidence is LOW or MEDIUM — not on every message.

**Why not on every message:** Adds latency and cost. Most messages (watering schedules, general care questions) don't need retrieved knowledge. Retrieval should trigger only when:
- Confidence is LOW or MEDIUM
- A pest/disease diagnosis is being attempted
- The question involves regional timing that the model's training data may get wrong

**How it works:**
1. Advisor assesses confidence (already happens in Phase 2)
2. If LOW/MEDIUM and topic matches pest/disease/timing: run a keyword lookup against the crop knowledge base
3. Inject the matched entries as additional context before generating the response
4. Advisor can now cite: "Based on Cornell Extension guidance..."

**Implementation:** A simple keyword-based lookup in a JSON file is sufficient for the crop list GrowLog AI currently supports. A vector database (Pinecone, pgvector) is not needed until the knowledge base exceeds ~500 entries.

---

## 5. Anonymized Collective Garden Intelligence

**What it is:** Aggregate patterns from session logs across all gardens — what problems are being reported most in each zone, what advice is most frequently given, what crops are failing.

**Privacy threshold:**
- Never expose individual user data
- Aggregate only at zone level (minimum 10 gardens per zone before surfacing insights)
- Opt-in for users, not opt-out
- No personal identifiers in aggregation

**Use case:** "Other gardeners in Zone 6b have been reporting aphids on brassicas this week." This is high-value local signal the AI cannot have any other way.

**When to build this:** After reaching meaningful user scale (100+ active gardens). The infrastructure is already there — session_logs has garden_id, zone is on gardens table.

---

## 6. Implementation Sequence (When Ready)

| Phase | What | Effort |
|---|---|---|
| 3A | Crop knowledge JSON for top 10 crops | Small |
| 3B | Pest/disease entries for top 20 problems | Medium |
| 3C | Regional extension link table | Small |
| 3D | Selective retrieval at low/medium confidence | Medium |
| 3E | Anonymized aggregate insights (Zone-level) | Large — do last |

---

## What NOT to build

- Full vector database for every message — retrieval cost on every chat turn is not justified
- LLM-generated crop knowledge — must be human-reviewed for accuracy before use
- Real-time pest/disease outbreak feeds — too complex, too much maintenance
- Fully automated source citation — citation accuracy must be verifiable, not inferred
