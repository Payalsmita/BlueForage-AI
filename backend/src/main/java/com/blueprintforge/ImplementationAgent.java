package com.blueprintforge;

import com.blueprintforge.AgentRun.*;
import com.blueprintforge.Models.*;
import com.fasterxml.jackson.annotation.JsonPropertyDescription;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Implementation Agent: new customer's notes → requirements → gap check → questions → (consultant) → decisions
 * → draft config → validate ↺ revise → UAT → handover → (consultant approval).
 *
 * Agentic, with guardrails: at each turn code decides which tools are ALLOWED given the state, and the LLM picks
 * one of them and explains why. Tools are deterministic where correctness matters (config, validation, coverage);
 * the LLM writes language (questions, interpreting free-text answers, test cases). Two human pause points.
 */
@Service
public class ImplementationAgent {
    private static final Logger log = LoggerFactory.getLogger(ImplementationAgent.class);
    static final int MAX_REVISIONS = 2, MAX_QUESTIONS = 10, MAX_TURNS = 25;

    static final Map<String, String> TOOLS = new LinkedHashMap<>();
    static {
        TOOLS.put("extract_requirements", "Read the customer's notes and extract stages, roles and approval rules (with a self-check pass)");
        TOOLS.put("gap_check", "Compare the customer's requirements with the industry blueprint (missing / unique / aligned)");
        TOOLS.put("draft_questions", "Draft clarifying questions for the consultant to ask the customer, then pause for answers");
        TOOLS.put("apply_answers", "Turn the consultant's answers into include/exclude decisions (interpreting free-text replies)");
        TOOLS.put("draft_config", "Assemble the final requirement list and draft the (mock) iCIMS configuration");
        TOOLS.put("validate_config", "Check the draft configuration: coverage, traceability, approvers, order, country scope");
        TOOLS.put("revise_config", "Automatically fix validation issues that are safe to fix, then re-validate");
        TOOLS.put("generate_uat", "Generate UAT test cases for every stage and approval rule and measure coverage");
        TOOLS.put("handover", "Assemble the handover pack and pause for consultant approval");
    }

    static final String PLAN_SYSTEM = """
            You are an implementation agent setting up a recruiting system (iCIMS) for a new customer.
            Each turn, choose exactly ONE tool from AVAILABLE TOOLS and give a one-sentence reason a consultant will read.
            Prefer asking the customer over assuming when requirements are missing. Prefer fixing validation issues
            before writing tests when the fixes are safe.
            """;
    static final String QUESTION_SYSTEM = """
            You help an implementation consultant prepare a customer call. For each item, write ONE short, specific,
            friendly question the consultant can ask the customer. MISSING items are common practice among peers that the
            customer did not mention; UNIQUE items are things only this customer does. Return one entry per id.
            """;
    static final String INTERPRET_SYSTEM = """
            You read a consultant's notes on a customer's answers. For each question, decide INCLUDE (the customer wants the
            item in their setup), EXCLUDE (they don't) or UNSURE (unclear or not answered). Give a short rationale quoting
            the answer. Return one entry per question id.
            """;
    static final String UAT_SYSTEM = """
            You write user acceptance test (UAT) cases for a recruiting-system configuration.
            For every requirement ref given, write at least one test case; for approval rules add a NEGATIVE case
            (e.g. the approval is missing or rejected). Steps are short imperative actions; expected is one observable result.
            type is POSITIVE, NEGATIVE or EDGE. Use only refs from the list.
            """;

    public record NextStep(@JsonPropertyDescription("One tool name from AVAILABLE TOOLS") String tool,
                           @JsonPropertyDescription("One sentence explaining the choice to the consultant") String reasoning) {}
    public record QuestionText(String id, String question) {}
    public record QuestionTexts(List<QuestionText> questions) {}
    public record Interpretation(String questionId, @JsonPropertyDescription("INCLUDE, EXCLUDE or UNSURE") String choice, String rationale) {}
    public record Interpretations(List<Interpretation> decisions) {}
    public record TestCases(List<TestCase> tests) {}
    public record StartRequest(String industry, String workflowType, String customerName, String geography, String notes) {}
    public record AnswersRequest(List<Answer> answers) {}
    public record ApprovalRequest(boolean approved, String comment) {}
    public record RunSummary(String id, String customerName, String industry, String workflowType, String geography,
                             AgentRun.Status status, Instant createdAt) {}

    private final Llm llm;
    private final Extractor extractor;
    private final GapChecker gapChecker;
    private final Blueprints blueprints;
    private final JsonMapper json;
    private final Path dir;

    public ImplementationAgent(Llm llm, Extractor extractor, GapChecker gapChecker, Blueprints blueprints, JsonMapper json,
                               @Value("${blueprint.data-dir}") String dataDir) {
        this.llm = llm;
        this.extractor = extractor;
        this.gapChecker = gapChecker;
        this.blueprints = blueprints;
        this.json = json;
        this.dir = Path.of(dataDir, "runs");
        // Runs interrupted by a restart can't resume their worker thread: mark them failed.
        list().stream().filter(r -> r.status() == AgentRun.Status.RUNNING).forEach(r -> {
            AgentRun run = get(r.id());
            run.status = AgentRun.Status.FAILED;
            run.error = "Interrupted by a server restart. Start a new run.";
            save(run);
        });
    }

    // ------------------------------------------------------------------ API

    public synchronized AgentRun start(StartRequest req) {
        for (String v : new String[]{req.industry(), req.workflowType()})
            if (v == null || !DocStore.SLUG.matcher(v).matches())
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "industry and workflowType are required");
        if (req.notes() == null || req.notes().isBlank())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "notes are required");
        blueprints.get(req.industry(), req.workflowType()); // 404 if no blueprint yet
        var run = new AgentRun();
        run.id = "RUN-" + UUID.randomUUID().toString().substring(0, 8);
        run.industry = req.industry();
        run.workflowType = req.workflowType();
        run.customerName = req.customerName() == null || req.customerName().isBlank() ? "New customer" : req.customerName().trim();
        run.geography = req.geography() == null ? "" : req.geography().trim().toUpperCase();
        run.notes = req.notes();
        run.status = AgentRun.Status.RUNNING;
        run.createdAt = Instant.now();
        save(run);
        Thread.ofVirtual().name("agent-" + run.id).start(() -> loop(run));
        return run;
    }

    public synchronized AgentRun answer(String id, AnswersRequest req) {
        AgentRun run = get(id);
        if (run.status != AgentRun.Status.WAITING_FOR_ANSWERS)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Run is not waiting for answers (status " + run.status + ")");
        run.answers = req.answers() == null ? List.of() : req.answers();
        run.status = AgentRun.Status.RUNNING;
        save(run);
        Thread.ofVirtual().name("agent-" + run.id).start(() -> loop(run));
        return run;
    }

    public synchronized AgentRun approve(String id, ApprovalRequest req) {
        AgentRun run = get(id);
        if (run.status != AgentRun.Status.WAITING_FOR_APPROVAL)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Run is not waiting for approval (status " + run.status + ")");
        run.status = req.approved() ? AgentRun.Status.COMPLETED : AgentRun.Status.REJECTED;
        run.approvalComment = req.comment();
        save(run);
        return run;
    }

    public AgentRun get(String id) {
        if (id == null || !DocStore.SLUG.matcher(id).matches())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid run id");
        Path p = dir.resolve(id + ".json");
        if (!Files.exists(p)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown run " + id);
        return json.readValue(p.toFile(), AgentRun.class);
    }

    public List<RunSummary> list() {
        if (!Files.isDirectory(dir)) return List.of();
        try (Stream<Path> files = Files.list(dir)) {
            return files.filter(p -> p.toString().endsWith(".json"))
                    .map(p -> json.readValue(p.toFile(), AgentRun.class))
                    .map(r -> new RunSummary(r.id, r.customerName, r.industry, r.workflowType, r.geography, r.status, r.createdAt))
                    .sorted(Comparator.comparing(RunSummary::createdAt, Comparator.nullsLast(Comparator.reverseOrder())))
                    .toList();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    // ------------------------------------------------------------------ agent loop

    void loop(AgentRun run) {
        try {
            for (int turn = 0; turn < MAX_TURNS && run.status == AgentRun.Status.RUNNING; turn++) {
                List<String> allowed = allowedTools(run);
                if (allowed.isEmpty()) break;
                NextStep next = plan(run, allowed);
                execute(run, next.tool(), next.reasoning());
            }
        } catch (Exception e) {
            log.error("Agent run {} failed", run.id, e);
            run.status = AgentRun.Status.FAILED;
            run.error = e.getMessage() == null ? e.toString() : e.getMessage();
            if (!run.steps.isEmpty() && "RUNNING".equals(run.steps.getLast().status())) {
                Step s = run.steps.removeLast();
                run.steps.add(new Step(s.n(), s.tool(), s.title(), s.reasoning(), "FAILED", s.startedAt(), Instant.now(), run.error));
            }
            save(run);
        }
    }

    /** Guardrails: which tools make sense in this state. The LLM only ever chooses among these. */
    static List<String> allowedTools(AgentRun run) {
        if (run.requirements == null) return List.of("extract_requirements");
        if (run.gaps == null) return List.of("gap_check");
        if (run.finalItems == null) {
            if (run.questions == null)
                return openFindings(run).isEmpty() ? List.of("draft_config") : List.of("draft_questions", "draft_config");
            if (run.decisions == null) return List.of("apply_answers");
            return List.of("draft_config");
        }
        if (run.validation == null) return List.of("validate_config");
        boolean fixable = run.validation.stream().anyMatch(c -> c.autoFixable() && !"PASS".equals(c.severity()));
        if (run.uat == null)
            return fixable && run.revisions < MAX_REVISIONS ? List.of("revise_config", "generate_uat") : List.of("generate_uat");
        if (!run.handoverReady) return List.of("handover");
        return List.of();
    }

    NextStep plan(AgentRun run, List<String> allowed) {
        var tools = allowed.stream().map(t -> "- " + t + ": " + TOOLS.get(t)).collect(Collectors.joining("\n"));
        try {
            NextStep n = llm.structured(NextStep.class, PLAN_SYSTEM, "STATE:\n" + stateSummary(run) + "\n\nAVAILABLE TOOLS:\n" + tools);
            if (n != null && allowed.contains(n.tool())) return n;
            log.warn("Planner chose a tool outside the guardrails ({}); using {}", n == null ? null : n.tool(), allowed.getFirst());
        } catch (RuntimeException e) {
            log.warn("Planner call failed, using the default next step: {}", e.getMessage());
        }
        return new NextStep(allowed.getFirst(), "Next required step.");
    }

    static String stateSummary(AgentRun r) {
        var sb = new StringBuilder("Customer: " + r.customerName + " (" + r.geography + "), scenario " + r.industry + "/" + r.workflowType + "\n");
        if (r.requirements != null) sb.append("Requirements extracted: ").append(r.requirements.stages().size()).append(" stages, ")
                .append(r.requirements.roles().size()).append(" roles, ").append(r.requirements.approvalRules().size()).append(" approval rules\n");
        if (r.gaps != null) sb.append("Gap check: ").append(count(r, GapType.MISSING)).append(" missing, ")
                .append(count(r, GapType.UNIQUE)).append(" unique, ").append(count(r, GapType.ALIGNED)).append(" aligned\n");
        if (r.questions != null) sb.append("Questions asked: ").append(r.questions.size()).append("\n");
        if (r.decisions != null) sb.append("Decisions: ").append(String.valueOf(r.decisions.stream()
                .collect(Collectors.groupingBy(Decision::choice, TreeMap::new, Collectors.counting())))).append("\n");
        if (r.finalItems != null) sb.append("Final requirements: ").append(r.finalItems.size()).append("\n");
        if (r.validation != null) sb.append("Validation: ").append(String.valueOf(r.validation.stream()
                .collect(Collectors.groupingBy(Check::severity, TreeMap::new, Collectors.counting()))))
                .append(", auto-fixable issues: ").append(r.validation.stream().filter(c -> c.autoFixable() && !"PASS".equals(c.severity())).count())
                .append(", revisions so far: ").append(r.revisions).append("\n");
        if (r.uat != null) sb.append("UAT cases: ").append(r.uat.size()).append("\n");
        return sb.toString();
    }

    private static long count(AgentRun r, GapType t) {
        return r.gaps.findings().stream().filter(f -> f.type() == t).count();
    }

    static List<GapFinding> openFindings(AgentRun r) {
        return r.gaps.findings().stream().filter(f -> f.type() != GapType.ALIGNED).limit(MAX_QUESTIONS).toList();
    }

    void execute(AgentRun run, String tool, String reasoning) {
        int n = run.steps.size() + 1;
        Instant started = Instant.now();
        String title = TOOLS.get(tool);
        run.steps.add(new Step(n, tool, title, reasoning, "RUNNING", started, null, null));
        save(run);
        String summary = switch (tool) {
            case "extract_requirements" -> extractRequirements(run);
            case "gap_check" -> gapCheck(run);
            case "draft_questions" -> draftQuestions(run);
            case "apply_answers" -> applyAnswers(run);
            case "draft_config" -> draftConfig(run);
            case "validate_config" -> validateConfig(run);
            case "revise_config" -> reviseConfig(run);
            case "generate_uat" -> generateUat(run);
            case "handover" -> handover(run);
            default -> throw new IllegalStateException("Unknown tool " + tool);
        };
        run.steps.set(n - 1, new Step(n, tool, title, reasoning, "DONE", started, Instant.now(), summary));
        save(run);
    }

    // ------------------------------------------------------------------ tools

    String extractRequirements(AgentRun run) {
        Extraction e = extractor.extractText(run.notes);
        run.requirements = e.patterns();
        run.selfCheckAdded = e.selfCheckAdded();
        var p = e.patterns();
        return "Found " + p.stages().size() + " stages, " + p.roles().size() + " roles and " + p.approvalRules().size()
                + " approval rules, each with a verified quote" + (e.selfCheckAdded() > 0 ? "; self-check recovered " + e.selfCheckAdded() + " missed item(s)" : "")
                + (e.droppedQuotes() > 0 ? "; dropped " + e.droppedQuotes() + " unverifiable quote(s)" : "") + ".";
    }

    String gapCheck(AgentRun run) {
        run.gaps = gapChecker.compare(blueprints.get(run.industry, run.workflowType), run.requirements, run.geography);
        return count(run, GapType.MISSING) + " missing vs peers, " + count(run, GapType.UNIQUE) + " unique to this customer, "
                + count(run, GapType.ALIGNED) + " aligned with the blueprint.";
    }

    String draftQuestions(AgentRun run) {
        var open = openFindings(run);
        var skeleton = new ArrayList<Question>();
        for (int i = 0; i < open.size(); i++) {
            GapFinding f = open.get(i);
            String why = f.type() == GapType.MISSING
                    ? "Used by " + f.peerSupport() + " peer implementations; the customer didn't mention it."
                    : "No peer implementation does this; confirm it's intentional and who owns it.";
            skeleton.add(new Question("Q" + (i + 1), f.type(), f.kind(), f.name(), f.blueprintItemId(), f.peerSupport(), defaultQuestion(f), why));
        }
        Map<String, String> texts = Map.of();
        try {
            String input = skeleton.stream().map(q -> q.id() + " | " + q.findingType() + " | " + q.kind() + " | " + q.itemName() + " | " + q.why())
                    .collect(Collectors.joining("\n"));
            texts = llm.structured(QuestionTexts.class, QUESTION_SYSTEM, "Customer: " + run.customerName + "\n\n" + input).questions().stream()
                    .filter(t -> t.question() != null && !t.question().isBlank())
                    .collect(Collectors.toMap(QuestionText::id, QuestionText::question, (a, b) -> a));
        } catch (RuntimeException e) {
            log.warn("Question wording failed, using templates: {}", e.getMessage());
        }
        Map<String, String> finalTexts = texts;
        run.questions = skeleton.stream().map(q -> new Question(q.id(), q.findingType(), q.kind(), q.itemName(), q.blueprintItemId(),
                q.peerSupport(), finalTexts.getOrDefault(q.id(), q.question()), q.why())).toList();
        run.status = AgentRun.Status.WAITING_FOR_ANSWERS;
        return "Drafted " + run.questions.size() + " questions for the customer. Waiting for the consultant's answers.";
    }

    static String defaultQuestion(GapFinding f) {
        String what = switch (f.kind()) { case STAGE -> "a \"" + f.name() + "\" step"; case ROLE -> "a \"" + f.name() + "\" role";
            case APPROVAL_RULE -> "an approval rule for \"" + f.name() + "\""; };
        return f.type() == GapType.MISSING ? "Most peers have " + what + ". Do you need it in your process?"
                : "You mentioned " + what + ". Can you confirm it's required and who owns it?";
    }

    String applyAnswers(AgentRun run) {
        Map<String, Answer> byQ = new HashMap<>();
        for (Answer a : run.answers) if (a.questionId() != null) byQ.put(a.questionId(), a);
        var decisions = new ArrayList<Decision>();
        var toInterpret = new ArrayList<Question>();
        for (Question q : run.questions) {
            Answer a = byQ.get(q.id());
            String choice = a == null ? null : normalizeChoice(a.choice());
            if (choice != null) decisions.add(new Decision(q.id(), q.itemName(), choice,
                    a.text() == null || a.text().isBlank() ? "Consultant selected " + choice + "." : a.text(), false));
            else if (a != null && a.text() != null && !a.text().isBlank()) toInterpret.add(q);
            else decisions.add(new Decision(q.id(), q.itemName(), "UNSURE", "No answer given.", false));
        }
        int interpreted = 0;
        if (!toInterpret.isEmpty()) {
            String input = toInterpret.stream().map(q -> q.id() + " | " + q.itemName() + " | Q: " + q.question() + "\n   ANSWER: " + byQ.get(q.id()).text())
                    .collect(Collectors.joining("\n"));
            Map<String, Interpretation> got = llm.structured(Interpretations.class, INTERPRET_SYSTEM, input).decisions().stream()
                    .filter(d -> d.questionId() != null)
                    .collect(Collectors.toMap(Interpretation::questionId, d -> d, (a, b) -> a));
            for (Question q : toInterpret) {
                Interpretation d = got.get(q.id());
                String choice = d == null ? null : normalizeChoice(d.choice());
                if (choice == null) choice = "UNSURE";
                else interpreted++;
                decisions.add(new Decision(q.id(), q.itemName(), choice, d == null ? "The agent could not interpret the answer." : d.rationale(), true));
            }
        }
        decisions.sort(Comparator.comparingInt(d -> Integer.parseInt(d.questionId().substring(1))));
        run.decisions = decisions;
        var counts = decisions.stream().collect(Collectors.groupingBy(Decision::choice, TreeMap::new, Collectors.counting()));
        return "Recorded " + decisions.size() + " decisions " + counts + (interpreted > 0 ? "; interpreted " + interpreted + " free-text answer(s)" : "") + ".";
    }

    static String normalizeChoice(String c) {
        if (c == null) return null;
        String u = c.trim().toUpperCase();
        return Set.of("INCLUDE", "EXCLUDE", "UNSURE").contains(u) ? u : null;
    }

    String draftConfig(AgentRun run) {
        Blueprint bp = blueprints.get(run.industry, run.workflowType);
        Map<String, BlueprintItem> bpById = bp.items().stream().collect(Collectors.toMap(BlueprintItem::id, i -> i, (a, b) -> a));
        Map<String, Decision> byItem = new HashMap<>();
        if (run.decisions != null) for (Decision d : run.decisions) byItem.put(d.itemName(), d);
        var items = new ArrayList<FinalItem>();
        int custom = 0;
        for (GapFinding f : run.gaps.findings()) {
            BlueprintItem b = f.blueprintItemId() == null ? null : bpById.get(f.blueprintItemId());
            Decision d = byItem.get(f.name());
            switch (f.type()) {
                case ALIGNED -> items.add(new FinalItem(f.blueprintItemId(), f.kind(), f.name(), "CUSTOMER_STATED", f.blueprintItemId(),
                        f.peerSupport(), b == null ? List.of() : b.approvers(), customerEvidence(f), b == null ? null : b.typicalOrder()));
                case MISSING -> {
                    if (d != null && "INCLUDE".equals(d.choice()))
                        items.add(new FinalItem(f.blueprintItemId(), f.kind(), f.name(), "PEER_CONFIRMED", f.blueprintItemId(), f.peerSupport(),
                                b == null ? List.of() : b.approvers(), b == null ? List.of() : b.evidence().stream().limit(3).toList(),
                                b == null ? null : b.typicalOrder()));
                    else if (d == null || "UNSURE".equals(d.choice()))
                        addOpen(run, "Confirm with the customer whether they need \"" + f.name() + "\" (" + f.peerSupport() + " peers use it).");
                }
                case UNIQUE -> {
                    if (d == null || !"EXCLUDE".equals(d.choice()))
                        items.add(new FinalItem(String.format("CUS-%02d", ++custom), f.kind(), f.name(), "CUSTOM", null, f.peerSupport(),
                                approversFor(run, f), customerEvidence(f), customerOrder(run, f)));
                    if (d != null && "UNSURE".equals(d.choice()))
                        addOpen(run, "Customer-specific \"" + f.name() + "\" is kept but still needs confirmation.");
                }
            }
        }
        run.finalItems = items;
        run.config = buildConfig(run, bp);
        long peer = items.stream().filter(i -> "PEER_CONFIRMED".equals(i.source())).count();
        long cus = items.stream().filter(i -> "CUSTOM".equals(i.source())).count();
        return "Final requirements: " + items.size() + " (" + peer + " confirmed peer practices, " + cus + " customer-specific). Drafted the mock iCIMS config.";
    }

    private static List<Evidence> customerEvidence(GapFinding f) {
        return f.customerQuotes() == null ? List.of() : f.customerQuotes().stream().map(q -> new Evidence("CUSTOMER", q)).toList();
    }

    private static List<String> approversFor(AgentRun run, GapFinding f) {
        if (f.kind() != Kind.APPROVAL_RULE) return List.of();
        return run.requirements.approvalRules().stream().filter(r -> r.trigger().equalsIgnoreCase(f.name()))
                .findFirst().map(ApprovalRule::approvers).orElse(List.of());
    }

    private static Double customerOrder(AgentRun run, GapFinding f) {
        if (f.kind() != Kind.STAGE) return null;
        return run.requirements.stages().stream().filter(s -> s.name().equalsIgnoreCase(f.name()))
                .findFirst().map(s -> (double) s.order()).orElse(null);
    }

    private static void addOpen(AgentRun run, String item) {
        if (!run.openItems.contains(item)) run.openItems.add(item);
    }

    /** Final requirements → blueprint-shaped items (stages in order) → the mock iCIMS config, plus the customer header. */
    static Map<String, Object> buildConfig(AgentRun run, Blueprint bp) {
        Map<String, BlueprintItem> bpById = bp.items().stream().collect(Collectors.toMap(BlueprintItem::id, i -> i, (a, b) -> a));
        int total = bp.sourceDocIds().size();
        var items = run.finalItems.stream()
                .sorted(Comparator.comparing((FinalItem i) -> i.kind())
                        .thenComparing(i -> i.order() == null ? Double.MAX_VALUE : i.order()))
                .map(i -> {
                    BlueprintItem b = i.blueprintItemId() == null ? null : bpById.get(i.blueprintItemId());
                    return new BlueprintItem(i.ref(), i.kind(), i.name(), List.of(),
                            b != null ? b.detail() : ("DERIVED".equals(i.source()) ? "Added so every approver has a user role." : "Customer-specific requirement."),
                            i.order(), b != null ? b.support() : 0, b != null ? b.total() : total, i.evidence(),
                            b != null ? b.geoSupport() : List.of(), Models.Status.APPROVED, null, i.approvers() == null ? List.of() : i.approvers());
                }).toList();
        var cfg = new LinkedHashMap<String, Object>();
        var built = IcimsExport.build(new Blueprint(bp.industry(), bp.workflowType(), bp.sourceDocIds(), items));
        cfg.put("_notice", built.remove("_notice"));
        cfg.put("customer", Map.of("name", run.customerName, "country", run.geography));
        cfg.putAll(built);
        return cfg;
    }

    String validateConfig(AgentRun run) {
        run.validation = validate(run);
        var c = run.validation.stream().collect(Collectors.groupingBy(Check::severity, TreeMap::new, Collectors.counting()));
        long fixable = run.validation.stream().filter(x -> x.autoFixable() && !"PASS".equals(x.severity())).count();
        run.validation.stream().filter(x -> !"PASS".equals(x.severity()) && !x.autoFixable())
                .forEach(x -> addOpen(run, x.message()));
        return "Ran " + run.validation.size() + " checks " + c + (fixable > 0 ? "; " + fixable + " can be fixed automatically" : "") + ".";
    }

    /** Deterministic checks on the drafted config (the "drift detector"). */
    @SuppressWarnings("unchecked")
    static List<Check> validate(AgentRun run) {
        var checks = new ArrayList<Check>();
        var cfg = run.config;
        var statuses = (List<Map<String, Object>>) ((Map<String, Object>) cfg.get("recruitingWorkflow")).get("statuses");
        var roles = (List<Map<String, Object>>) cfg.get("userRoles");
        var chains = (List<Map<String, Object>>) cfg.get("approvalChains");
        Set<String> configured = new HashSet<>();
        Stream.of(statuses, roles, chains).flatMap(List::stream).forEach(m -> configured.add((String) m.get("blueprintItemId")));

        // 1. every customer-stated requirement is configured
        var stated = run.finalItems.stream().filter(i -> !"PEER_CONFIRMED".equals(i.source()) && !"DERIVED".equals(i.source())).toList();
        var notConfigured = stated.stream().filter(i -> !configured.contains(i.ref())).map(FinalItem::name).toList();
        checks.add(notConfigured.isEmpty()
                ? new Check("", "PASS", "Requirement coverage", "All " + stated.size() + " customer-stated requirements are in the configuration.", null, false)
                : new Check("", "FAIL", "Requirement coverage", "Not configured: " + String.join(", ", notConfigured), null, false));
        // 2. every configured entry traces to evidence
        var untraced = run.finalItems.stream().filter(i -> !"DERIVED".equals(i.source()) && (i.evidence() == null || i.evidence().isEmpty()))
                .map(FinalItem::name).toList();
        checks.add(untraced.isEmpty()
                ? new Check("", "PASS", "Traceability", "Every configured item links to a quote (customer notes or peer implementations).", null, false)
                : new Check("", "WARN", "Traceability", "No supporting quote for: " + String.join(", ", untraced), null, false));
        // 3. approval chains have approvers
        for (var ch : chains)
            if (((List<?>) ch.get("approvers")).isEmpty())
                checks.add(new Check("", "FAIL", "Approvers", "Approval chain \"" + ch.get("name") + "\" has no approvers; ask the customer who signs off.",
                        (String) ch.get("blueprintItemId"), false));
        // 4. every approver has a user role
        Set<String> roleNames = roles.stream().map(r -> ((String) r.get("role")).toLowerCase()).collect(Collectors.toSet());
        var missingRoles = chains.stream().flatMap(ch -> ((List<String>) ch.get("approvers")).stream())
                .filter(a -> !roleNames.contains(a.toLowerCase())).distinct().toList();
        checks.add(missingRoles.isEmpty()
                ? new Check("", "PASS", "Approver roles", "Every approver has a user role.", null, false)
                : new Check("", "WARN", "Approver roles", "Approvers without a user role: " + String.join(", ", missingRoles), null, true));
        // 5. offer comes after screening/assessment/interviews/checks
        int offerAt = -1, lastBeforeOffer = -1;
        for (int i = 0; i < statuses.size(); i++) {
            String bin = (String) statuses.get(i).get("bin");
            if ("OFFER".equals(bin) && offerAt < 0) offerAt = i;
            else if (!"OFFER".equals(bin) && !"PRE_HIRE_CHECKS".equals(bin)) lastBeforeOffer = i;
        }
        checks.add(offerAt < 0
                ? new Check("", "FAIL", "Offer stage", "The workflow has no offer stage.", null, false)
                : offerAt < lastBeforeOffer
                ? new Check("", "WARN", "Stage order", "\"" + statuses.get(offerAt).get("status") + "\" comes before screening/interview stages.", null, true)
                : new Check("", "PASS", "Stage order", "Offer comes after screening, assessment and interview stages.", null, false));
        // 6. country scope
        var wrongCountry = Stream.of(statuses, chains).flatMap(List::stream)
                .filter(m -> { var cs = (List<String>) m.get("appliesToCountries");
                    return !cs.contains("ALL") && !run.geography.isEmpty() && !cs.contains(run.geography); })
                .map(m -> m.getOrDefault("status", m.get("name")) + " (" + m.get("appliesToCountries") + ")").toList();
        checks.add(wrongCountry.isEmpty()
                ? new Check("", "PASS", "Country scope", "Everything configured applies in " + (run.geography.isEmpty() ? "the customer's country" : run.geography) + ".", null, false)
                : new Check("", "FAIL", "Country scope", "Configured items scoped to other countries: " + String.join(", ", wrongCountry), null, true));
        // 7. duplicates
        var dup = statuses.stream().map(m -> ((String) m.get("status")).toLowerCase())
                .collect(Collectors.groupingBy(s -> s, Collectors.counting())).entrySet().stream()
                .filter(e -> e.getValue() > 1).map(Map.Entry::getKey).toList();
        checks.add(dup.isEmpty()
                ? new Check("", "PASS", "Duplicate stages", "No duplicate workflow statuses.", null, false)
                : new Check("", "WARN", "Duplicate stages", "Duplicate statuses: " + String.join(", ", dup), null, true));
        // 8. peer standard approvals present
        boolean hasRequisition = chains.stream().anyMatch(ch -> "REQUISITION".equals(ch.get("appliesTo")));
        checks.add(hasRequisition
                ? new Check("", "PASS", "Requisition approval", "A requisition approval chain is configured.", null, false)
                : new Check("", "WARN", "Requisition approval", "No requisition approval chain; most peers have one. Confirm with the customer.", null, false));
        for (int i = 0; i < checks.size(); i++) {
            Check c = checks.get(i);
            checks.set(i, new Check("V" + (i + 1), c.severity(), c.check(), c.message(), c.ref(), c.autoFixable()));
        }
        return checks;
    }

    String reviseConfig(AgentRun run) {
        return revise(run, blueprints.get(run.industry, run.workflowType));
    }

    /** Applies the safe automatic fixes for the current validation issues and rebuilds the config. */
    static String revise(AgentRun run, Blueprint bp) {
        var fixes = new ArrayList<String>();
        var items = new ArrayList<>(run.finalItems);
        for (Check c : run.validation) {
            if (!c.autoFixable() || "PASS".equals(c.severity())) continue;
            switch (c.check()) {
                case "Approver roles" -> {
                    Set<String> roles = items.stream().filter(i -> i.kind() == Kind.ROLE).map(i -> i.name().toLowerCase()).collect(Collectors.toSet());
                    int n = (int) items.stream().filter(i -> i.ref().startsWith("DER-")).count();
                    for (String a : items.stream().filter(i -> i.kind() == Kind.APPROVAL_RULE)
                            .flatMap(i -> i.approvers() == null ? Stream.<String>empty() : i.approvers().stream()).distinct().toList())
                        if (roles.add(a.toLowerCase())) {
                            items.add(new FinalItem(String.format("DER-%02d", ++n), Kind.ROLE, a, "DERIVED", null, null, List.of(), List.of(), null));
                            fixes.add("added user role \"" + a + "\"");
                        }
                }
                case "Stage order" -> {
                    double max = items.stream().filter(i -> i.kind() == Kind.STAGE && i.order() != null).mapToDouble(FinalItem::order).max().orElse(0);
                    items.replaceAll(i -> i.kind() == Kind.STAGE && "OFFER".equals(IcimsExport.bin(i.name()))
                            ? new FinalItem(i.ref(), i.kind(), i.name(), i.source(), i.blueprintItemId(), i.peerSupport(), i.approvers(), i.evidence(), max + 1) : i);
                    fixes.add("moved the offer stage to the end");
                }
                case "Country scope" -> {
                    var cfgByRef = new HashMap<String, List<String>>();
                    IcimsExportView.scopes(run.config).forEach(cfgByRef::put);
                    items.removeIf(i -> {
                        var cs = cfgByRef.get(i.ref());
                        boolean wrong = cs != null && !cs.contains("ALL") && !cs.contains(run.geography) && !"CUSTOM".equals(i.source())
                                && !"CUSTOMER_STATED".equals(i.source());
                        if (wrong) fixes.add("removed \"" + i.name() + "\" (only used in " + cs + ")");
                        return wrong;
                    });
                }
                case "Duplicate stages" -> {
                    Set<String> seen = new HashSet<>();
                    items.removeIf(i -> {
                        boolean d = i.kind() == Kind.STAGE && !seen.add(i.name().toLowerCase());
                        if (d) fixes.add("removed duplicate \"" + i.name() + "\"");
                        return d;
                    });
                }
                default -> { }
            }
        }
        run.finalItems = items;
        run.config = buildConfig(run, bp);
        run.revisions++;
        run.validation = null; // forces re-validation
        return fixes.isEmpty() ? "No safe automatic fixes found." : "Revision " + run.revisions + ": " + String.join("; ", fixes) + ".";
    }

    String generateUat(AgentRun run) {
        var testable = run.finalItems.stream().filter(i -> i.kind() != Kind.ROLE).toList();
        String input = testable.stream().map(i -> i.ref() + " | " + i.kind() + " | " + i.name()
                        + (i.approvers() == null || i.approvers().isEmpty() ? "" : " | approvers: " + String.join(", ", i.approvers())))
                .collect(Collectors.joining("\n"));
        Set<String> refs = testable.stream().map(FinalItem::ref).collect(Collectors.toSet());
        var tests = llm.structured(TestCases.class, UAT_SYSTEM, "Customer: " + run.customerName + " (" + run.geography + ")\nREQUIREMENTS:\n" + input)
                .tests().stream().filter(t -> t.requirementRef() != null && refs.contains(t.requirementRef())).toList();
        var numbered = new ArrayList<TestCase>();
        for (int i = 0; i < tests.size(); i++) {
            TestCase t = tests.get(i);
            String type = t.type() == null ? "POSITIVE" : t.type().trim().toUpperCase();
            numbered.add(new TestCase(String.format("UAT-%02d", i + 1), t.requirementRef(),
                    Set.of("POSITIVE", "NEGATIVE", "EDGE").contains(type) ? type : "POSITIVE",
                    t.title(), t.steps() == null ? List.of() : t.steps(), t.expected()));
        }
        run.uat = numbered;
        Set<String> covered = numbered.stream().map(TestCase::requirementRef).collect(Collectors.toSet());
        var uncovered = testable.stream().filter(i -> !covered.contains(i.ref())).map(i -> i.ref() + " " + i.name()).toList();
        run.uatCoverage = new Coverage(testable.size() - uncovered.size(), testable.size(), uncovered);
        uncovered.forEach(u -> addOpen(run, "No UAT test yet for " + u + "."));
        return "Generated " + numbered.size() + " test cases covering " + run.uatCoverage.covered() + "/" + run.uatCoverage.total() + " requirements.";
    }

    String handover(AgentRun run) {
        run.handoverReady = true;
        run.status = AgentRun.Status.WAITING_FOR_APPROVAL;
        return "Handover pack ready (requirements, decisions, config, validation, " + run.uat.size() + " UAT cases, "
                + run.openItems.size() + " open items). Waiting for consultant approval.";
    }

    // ------------------------------------------------------------------ exports

    public String handoverMarkdown(String id) {
        AgentRun r = get(id);
        if (r.finalItems == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "The run hasn't drafted a configuration yet");
        var sb = new StringBuilder("# Implementation handover: " + r.customerName + "\n\n")
                .append("Scenario: ").append(r.industry).append(" / ").append(r.workflowType).append(" · Country: ").append(r.geography)
                .append(" · Run: ").append(r.id).append(" · Status: ").append(r.status).append("\n\n");
        if (r.approvalComment != null && !r.approvalComment.isBlank()) sb.append("> Consultant: ").append(r.approvalComment).append("\n\n");
        sb.append("## Final requirements\n\n| Ref | Kind | Name | Source | Peers | Approvers |\n|---|---|---|---|---|---|\n");
        r.finalItems.forEach(i -> sb.append("| ").append(i.ref()).append(" | ").append(i.kind()).append(" | ").append(i.name()).append(" | ")
                .append(i.source()).append(" | ").append(i.peerSupport() == null ? "" : i.peerSupport()).append(" | ")
                .append(i.approvers() == null ? "" : String.join(", ", i.approvers())).append(" |\n"));
        if (r.decisions != null && !r.decisions.isEmpty()) {
            sb.append("\n## Decisions\n\n");
            r.decisions.forEach(d -> sb.append("- **").append(d.questionId()).append(" ").append(d.itemName()).append("**: ").append(d.choice())
                    .append(d.interpretedByAgent() ? " (AI-interpreted)" : "").append(" — ").append(d.rationale()).append("\n"));
        }
        if (r.validation != null) {
            sb.append("\n## Validation").append(r.revisions > 0 ? " (after " + r.revisions + " revision(s))" : "").append("\n\n");
            r.validation.forEach(c -> sb.append("- ").append(c.severity()).append(" · ").append(c.check()).append(": ").append(c.message()).append("\n"));
        }
        if (r.uat != null) {
            sb.append("\n## UAT test cases (").append(r.uatCoverage.covered()).append("/").append(r.uatCoverage.total()).append(" requirements covered)\n\n");
            r.uat.forEach(t -> {
                sb.append("### ").append(t.id()).append(" · ").append(t.type()).append(" · ").append(t.title()).append(" (").append(t.requirementRef()).append(")\n");
                for (int i = 0; i < t.steps().size(); i++) sb.append(i + 1).append(". ").append(t.steps().get(i)).append("\n");
                sb.append("\nExpected: ").append(t.expected()).append("\n\n");
            });
        }
        if (!r.openItems.isEmpty()) {
            sb.append("## Open items\n\n");
            r.openItems.forEach(o -> sb.append("- [ ] ").append(o).append("\n"));
        }
        sb.append("\n## Agent activity\n\n");
        r.steps.forEach(s -> sb.append(s.n()).append(". **").append(s.tool()).append("** — ").append(s.reasoning() == null ? "" : s.reasoning())
                .append(" → ").append(s.summary() == null ? s.status() : s.summary()).append("\n"));
        sb.append("\n_The configuration is a MOCK iCIMS-style export (not an official schema); see config.json._\n");
        return sb.toString();
    }

    private void save(AgentRun run) {
        try {
            run.updatedAt = Instant.now();
            Files.createDirectories(dir);
            Path tmp = dir.resolve(run.id + ".json.tmp");
            json.writeValue(tmp.toFile(), run);
            Files.move(tmp, dir.resolve(run.id + ".json"), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot save run " + run.id, e);
        }
    }

    /** Reads the country scope of each configured status/approval chain back out of the config map. */
    static final class IcimsExportView {
        @SuppressWarnings("unchecked")
        static Map<String, List<String>> scopes(Map<String, Object> cfg) {
            var out = new HashMap<String, List<String>>();
            var statuses = (List<Map<String, Object>>) ((Map<String, Object>) cfg.get("recruitingWorkflow")).get("statuses");
            var chains = (List<Map<String, Object>>) cfg.get("approvalChains");
            Stream.of(statuses, chains).flatMap(List::stream)
                    .forEach(m -> out.put((String) m.get("blueprintItemId"), (List<String>) m.get("appliesToCountries")));
            return out;
        }
    }
}
