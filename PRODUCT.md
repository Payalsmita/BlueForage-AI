# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: hackathon judges** at the iCIMS AI-gnite hackathon, watching a live 5-minute demo (screen share or projector) or a recorded video. They don't operate the app; they must understand the problem, the mechanism and the proof from what's on screen, quickly and at a distance.

**Secondary (the product's real user): iCIMS implementation consultants**, who configure the recruiting system for new customers. Their job: start a new customer from proven industry patterns, check what the customer is missing, and hand over a validated configuration.

## Product Purpose

BlueprintForge AI turns past recruiting-system implementations into evidence-backed industry blueprints (stages, roles, approval rules, with how many peers use each and where), and an Implementation Agent takes a new customer from kickoff notes to a validated configuration, UAT tests and a handover pack. Success: weeks of from-scratch configuration become minutes, with a consultant approving every decision.

## Positioning

- Every recommendation is backed by a verbatim quote from a real source document, checked by code, and counted by code (not by the AI).
- Accuracy is proven against an answer key, not claimed.
- The agent plans its own steps but code limits what it may do; a human answers its questions and approves the result.
- Competing ATS agents (iCIMS, Workday, Greenhouse) automate recruiting; none automates the implementation itself.

## Operating Context

- Shown live on a projector or shared screen, on a laptop, and in recorded demo videos. Viewers can't zoom.
- The demo follows DEMO_SCRIPT.md: Overview → Sources → Blueprint → Accuracy → Gap check → Implementation Agent.
- Agent runs take 30–90 s of live AI time; the UI must make that wait legible (what the agent is doing and why).

## Capabilities and Constraints

- React (Vite) frontend in `frontend/`, built into the Spring Boot backend's static folder; REST API documented in `api.yml` / Swagger.
- Seven scenarios (airlines, technology, finance, healthcare, retail, automotive, hospitality), 35 fictional implementation documents.
- Features: blueprint review (approve/edit/reject, evidence viewer, per-country support, order differences, approvers), exports (Markdown, JSON, mock iCIMS config), accuracy check, gap check, document upload (PDF/DOCX/PPTX via MarkItDown), Implementation Agent with two human pause points, MCP server.
- The iCIMS configuration export is a mock, not an official schema, and must be labelled as such.

## Brand Commitments

- Own product identity: **BlueprintForge AI** (repo: BlueForage-AI). Not presented as an official iCIMS product; no iCIMS logos or assets.

## Evidence on Hand

- Accuracy results measured on the live model: 100% recall for stages, roles and approval rules across all 7 scenarios; 100% of quotes verified; approval-rule precision 100%.
- A completed real agent run (Polar Wings, Canada) and the sample customers in `frontend/public/samples/`.
- All customer data is fictional and marked FICTIONAL. Do not invent customers, testimonials, time savings or metrics beyond these.

## Product Principles

1. Show the evidence: every claim on screen should be one click from its source quote.
2. Make the AI legible: what it did, why, and what code verified.
3. The human stays in charge, visibly: questions and approvals are moments, not footnotes.
4. Proof over promise: measured numbers beat adjectives.

## Accessibility & Inclusion

Readable at projector distance and in compressed video: large type, strong contrast, no meaning carried by colour alone. Keyboard operable, respects reduced motion.
