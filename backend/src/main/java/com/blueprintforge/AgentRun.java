package com.blueprintforge;

import com.blueprintforge.Models.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * One Implementation Agent run for a new customer, saved as data/runs/{id}.json after every change.
 * Mutable on purpose: only the agent's worker thread changes a RUNNING run; API calls only change paused runs.
 */
public class AgentRun {
    public enum Status { RUNNING, WAITING_FOR_ANSWERS, WAITING_FOR_APPROVAL, COMPLETED, REJECTED, FAILED }

    public record Step(int n, String tool, String title, String reasoning, String status,
                       Instant startedAt, Instant finishedAt, String summary) {}

    public record Question(String id, GapType findingType, Kind kind, String itemName, String blueprintItemId,
                           String peerSupport, String question, String why) {}

    /** choice: INCLUDE / EXCLUDE / UNSURE, or null when only free text was given (the agent interprets it). */
    public record Answer(String questionId, String choice, String text) {}

    public record Decision(String questionId, String itemName, String choice, String rationale, boolean interpretedByAgent) {}

    /** source: CUSTOMER_STATED (customer said it, matches peers), PEER_CONFIRMED (peer practice the customer accepted),
     *  CUSTOM (customer-specific), DERIVED (added by the agent while fixing validation issues). */
    public record FinalItem(String ref, Kind kind, String name, String source, String blueprintItemId, String peerSupport,
                            List<String> approvers, List<Evidence> evidence, Double order) {}

    /** severity: PASS / WARN / FAIL. autoFixable checks can be fixed by the revise_config tool. */
    public record Check(String id, String severity, String check, String message, String ref, boolean autoFixable) {}

    public record TestCase(String id, String requirementRef, String type, String title, List<String> steps, String expected) {}

    public record Coverage(int covered, int total, List<String> uncovered) {}

    public String id, industry, workflowType, customerName, geography, notes;
    public Status status;
    public Instant createdAt, updatedAt;
    public String error;
    public List<Step> steps = new ArrayList<>();

    public Patterns requirements;
    public int selfCheckAdded;
    public GapReport gaps;
    public List<Question> questions;
    public List<Answer> answers;
    public List<Decision> decisions;
    public List<FinalItem> finalItems;
    public Map<String, Object> config;
    public List<Check> validation;
    public int revisions;
    public List<TestCase> uat;
    public Coverage uatCoverage;
    public boolean handoverReady;
    public List<String> openItems = new ArrayList<>();
    public String approvalComment;
}
