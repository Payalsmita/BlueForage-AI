"""Generate FICTIONAL implementation docs into docs/ and register them in docs/manifest.csv.

Idempotent: re-running rewrites the generated docs and their manifest rows; hand-written rows are kept.
Also writes docs/ground_truth.json (the answer key for the accuracy eval).
To add a scenario, append co(...) entries and run:  python3 tools/gen_synthetic_docs.py

Stage tuples: (name, description, owner). Varying names across companies ("Recruiter Screen" vs
"Recruiter Phone Screen") and skipping stages is deliberate: it is what the normalizer and the
confidence scores are demonstrated on.
"""
import csv
import json
import re
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"

C = []  # companies


def co(doc_id, name, industry, geo, workflow, fmt, title, intro, stages, roles, approvals, notes=()):
    C.append(dict(doc_id=doc_id, name=name, industry=industry, geo=geo, workflow=workflow, fmt=fmt, title=title,
                  intro=intro, stages=stages, roles=roles, approvals=approvals, notes=notes))


# ---------------------------------------------------------------- technology / software-engineer
TECH = ("technology", "software-engineer")
co("TECH-001", "Nimbus Cloud", *TECH[:1], "US", TECH[1], "list", "Software Engineer Hiring Implementation",
   "Nimbus Cloud hires backend and full-stack Software Engineers (L3-L5) for remote and hub roles.",
   [("Application Review", "The recruiter checks years of experience and core language skills.", "Recruiter"),
    ("Recruiter Phone Screen", "30-minute call on motivation, level, and compensation expectations.", "Recruiter"),
    ("Online Coding Assessment", "90-minute timed assessment with two algorithm problems.", "Recruiter"),
    ("Technical Phone Interview", "Live coding with a senior engineer.", "Interviewers"),
    ("Virtual Onsite Loop", "Four interviews: two coding, one system design, one behavioral.", "Interviewers"),
    ("Hiring Committee Review", "A hiring committee reviews all feedback and decides hire or no hire.", "Hiring Committee"),
    ("Reference Check", "Two professional references.", "Recruiter"),
    ("Background Check", "Employment and criminal history verification.", "Recruiter"),
    ("Offer", "Offer generated from the engineering compensation bands.", "Compensation Partner")],
   [("Recruiter", "owns screening and scheduling."), ("Engineering Manager", "is the hiring manager for the requisition."),
    ("Interviewers", "trained engineers who run technical interviews."),
    ("Hiring Committee", "makes the final hire decision."), ("Compensation Partner", "builds the offer.")],
   ["Every requisition requires approval from the VP of Engineering and Finance.",
    "Offers above the compensation band require approval from the VP of Engineering and the Compensation team.",
    "Equity grants above guideline require CFO approval."])
co("TECH-002", "Quantix Labs", "technology", "US", "software-engineer", "table", "Engineering Recruiting Configuration",
   "Quantix Labs hires Software Engineers for its data platform team.",
   [("Resume Screen", "", "Recruiter"), ("Recruiter Call", "", "Recruiter"),
    ("Take-Home Project", "A 4-hour take-home project reviewed by two engineers.", "Interviewers"),
    ("Technical Interview", "", "Interviewers"), ("Onsite Loop", "", "Engineering Manager"),
    ("Background Check", "", "Recruiter"), ("Offer", "", "Engineering Manager")],
   [("Recruiter", "screens resumes and runs the recruiter call."),
    ("Engineering Manager", "is the hiring manager and makes the final decision."),
    ("Interviewers", "review take-home projects and run interviews.")],
   ["Requisitions need sign-off from the VP of Engineering and Finance.",
    "Offers above the compensation band need approval from the VP of Engineering and the Compensation team.",
    "Sign-on bonuses must be approved by Finance."],
   ["Quantix does not use a hiring committee; the Engineering Manager makes the final decision."])
co("TECH-003", "Brightpath Software", "technology", "IN", "software-engineer", "notes", "Implementation Workshop Notes (Engineering Hiring)",
   "Attendees: Brightpath TA lead, Director of Engineering, iCIMS consultant.",
   [("Application Review", "recruiter checks degree, experience, and notice period", ""),
    ("Recruiter Phone Screen", "confirm notice period and expected CTC", ""),
    ("Online Coding Test", "timed test on the assessment vendor platform", ""),
    ("Technical Interview Round 1", "data structures and coding", ""),
    ("Technical Interview Round 2", "system design", ""),
    ("Hiring Manager Interview", "", ""), ("HR Interview", "", ""),
    ("Background Verification", "education and previous employment verified by a vendor", ""), ("Offer", "", "")],
   [("Recruiter", ""), ("Hiring Manager", "makes the hire decision"), ("Interviewers", ""), ("HR Business Partner", "runs the HR interview and offer")],
   ["Requisitions require approval from the VP of Engineering and Finance.",
    "Offers above the compensation band require approval from the VP of Engineering and the HR Head.",
    "Joining bonuses require Finance approval."],
   ["Decision: Brightpath does NOT use a take-home project.",
    "Decision: offer letters must state the notice-period buyout if applicable."])
co("TECH-004", "Corelink Systems", "technology", "DE", "software-engineer", "list", "Software Engineer Recruiting Design (Germany)",
   "Corelink Systems hires Software Engineers in Berlin and Munich.",
   [("Application Review", "Recruiter reviews CV and work permit status.", "Recruiter"),
    ("Recruiter Screen", "30-minute video call.", "Recruiter"),
    ("Pair Programming Session", "90-minute pair programming session that replaces a coding test.", "Interviewers"),
    ("System Design Interview", "", "Interviewers"),
    ("Team Fit Interview", "Conversation with the Engineering Manager and a future teammate.", "Engineering Manager"),
    ("Reference Check", "", "Recruiter"), ("Offer", "", "Engineering Manager")],
   [("Recruiter", "owns screening and scheduling."), ("Engineering Manager", "is the hiring manager."),
    ("Interviewers", "run the pair programming and design interviews.")],
   ["Requisitions require approval from the VP of Engineering and Finance.",
    "Offers above the compensation band require approval from the VP of Engineering and the Compensation team.",
    "Every hire must be notified to the Works Council before the offer is sent."],
   ["Background checks are not performed for this role in Germany."])
co("TECH-005", "Vertex Data", "technology", "US", "software-engineer", "table", "Engineering Hiring Configuration Summary",
   "Vertex Data hires Software Engineers across product teams.",
   [("Application Review", "", "Recruiter"), ("Recruiter Phone Screen", "", "Recruiter"),
    ("Coding Assessment", "", "Recruiter"), ("Virtual Onsite Loop", "", "Interviewers"),
    ("Hiring Committee Review", "", "Hiring Committee"), ("Background Check", "", "Recruiter"),
    ("Offer", "", "Compensation Partner")],
   [("Recruiter", "screens and schedules."), ("Engineering Manager", "is the hiring manager."),
    ("Hiring Committee", "approves every hire."), ("Compensation Partner", "prepares offers.")],
   ["Offers above the compensation band require approval from the VP of Engineering and the Compensation team.",
    "Equity grants above guideline require CFO approval.",
    "Sign-on bonuses require Finance approval."])

# ---------------------------------------------------------------- finance / financial-advisor
co("FIN-001", "Harborstone Wealth", "finance", "US", "financial-advisor", "list", "Financial Advisor Hiring Implementation",
   "Harborstone Wealth hires licensed Financial Advisors for its branch network.",
   [("Application Review", "Recruiter checks licenses held and years of client-facing experience.", "Recruiter"),
    ("Recruiter Phone Screen", "", "Recruiter"),
    ("Hiring Manager Interview", "Interview with the Branch Manager.", "Branch Manager"),
    ("Client Role-Play Exercise", "Candidate runs a mock client review meeting.", "Branch Manager"),
    ("Panel Interview", "Branch Manager, Regional Director, and HR Business Partner.", "Regional Director"),
    ("Licensing Verification", "FINRA Series 7 and Series 66 verified through BrokerCheck.", "Compliance Officer"),
    ("Background Check", "Includes Form U4 disclosure review and a credit check.", "Compliance Officer"),
    ("Fingerprinting", "Fingerprints submitted to FINRA.", "HR Business Partner"),
    ("Offer", "", "HR Business Partner")],
   [("Recruiter", "screens applicants."), ("Branch Manager", "is the hiring manager."),
    ("Regional Director", "leads the panel interview."), ("Compliance Officer", "owns licensing and background review."),
    ("HR Business Partner", "prepares the offer.")],
   ["Requisitions require approval from the Regional Director and Finance.",
    "Offers above the standard pay band require approval from the Regional Director and the HR Director.",
    "Any draw or compensation guarantee requires approval from Finance and Compliance.",
    "Candidates with disclosures on Form U4 require approval from the Chief Compliance Officer."])
co("FIN-002", "Ledgerline Bank", "finance", "US", "financial-advisor", "table", "Advisor Recruiting Configuration Notes",
   "Ledgerline Bank recruits Financial Advisors for in-branch wealth teams.",
   [("Resume Screen", "", "Recruiter"), ("Recruiter Screen", "", "Recruiter"),
    ("Branch Manager Interview", "", "Branch Manager"), ("Case Study Presentation", "", "Branch Manager"),
    ("Background & Credit Check", "", "Compliance Officer"), ("Fingerprinting", "", "HR Business Partner"),
    ("FINRA Registration Check", "", "Compliance Officer"), ("Offer", "", "HR Business Partner")],
   [("Recruiter", "screens resumes."), ("Branch Manager", "acts as hiring manager."),
    ("Compliance Officer", "owns registration and background checks."), ("HR Business Partner", "owns the offer.")],
   ["Requisitions require approval from the Regional Director and Finance.",
    "Offers above the standard pay band need approval from the Regional Director and the HR Director.",
    "Candidates with Form U4 disclosures need Chief Compliance Officer approval."])
co("FIN-003", "Crown & Castle Financial", "finance", "UK", "financial-advisor", "notes", "Workshop Notes: Adviser Recruitment (UK)",
   "Attendees: Crown & Castle Head of Resourcing, Compliance lead, iCIMS consultant.",
   [("Application Review", "recruiter checks qualifications such as the Level 4 Diploma", ""),
    ("Recruiter Phone Screen", "", ""), ("Competency Interview", "", ""),
    ("Role-Play Exercise", "mock client fact-find", ""), ("Panel Interview", "", ""),
    ("Regulatory Reference Check", "five years of regulatory references requested from previous employers", ""),
    ("Credit and Criminal Record Check", "basic DBS check and credit check", ""), ("Offer", "", "")],
   [("Recruiter", ""), ("Hiring Manager", "the Regional Manager"), ("Compliance Officer", "owns regulatory references"),
    ("HR Business Partner", "")],
   ["Offers above the standard pay band require approval from the Regional Director and the HR Director.",
    "A Senior Manager must certify the adviser as fit and proper before the start date."],
   ["Decision: fingerprinting is not used in the UK process."])
co("FIN-004", "Pinegrove Advisors", "finance", "US", "financial-advisor", "list", "Financial Advisor Hiring Summary",
   "Pinegrove Advisors is an independent advisory firm hiring Financial Advisors.",
   [("Application Review", "", "Recruiter"), ("Recruiter Phone Screen", "", "Recruiter"),
    ("Hiring Manager Interview", "", "Branch Manager"),
    ("Client Role-Play Exercise", "Candidate presents a portfolio review to a mock client.", "Branch Manager"),
    ("Licensing Verification", "Series 7 and 66 checked on BrokerCheck.", "Compliance Officer"),
    ("Background Check", "", "Compliance Officer"), ("Offer", "", "Branch Manager")],
   [("Recruiter", "screens applicants."), ("Branch Manager", "is the hiring manager and owns the offer."),
    ("Compliance Officer", "verifies licenses and runs background checks.")],
   ["Requisitions require approval from the Regional Director and Finance.",
    "Any draw or compensation guarantee requires approval from Finance and Compliance."],
   ["Pinegrove does not run a panel interview."])
co("FIN-005", "Northgate Securities", "finance", "CA", "financial-advisor", "table", "Investment Advisor Recruiting Configuration (Canada)",
   "Northgate Securities hires Investment Advisors across Canadian branches.",
   [("Application Review", "", "Recruiter"), ("Recruiter Screen", "", "Recruiter"),
    ("Branch Manager Interview", "", "Branch Manager"), ("Panel Interview", "", "Regional Director"),
    ("CIRO Registration Verification", "", "Compliance Officer"),
    ("Criminal Record and Credit Check", "", "Compliance Officer"), ("Offer", "", "HR Business Partner")],
   [("Recruiter", "screens applicants."), ("Branch Manager", "is the hiring manager."),
    ("Regional Director", "chairs the panel."), ("Compliance Officer", "owns registration checks."),
    ("HR Business Partner", "prepares the offer.")],
   ["Requisitions require approval from the Regional Director and Finance.",
    "Offers above the standard pay band require approval from the Regional Director and the HR Director.",
    "Candidates with regulatory disclosures require Chief Compliance Officer approval."])

# ---------------------------------------------------------------- retail / store-associate
co("RET-001", "Freshmart Grocers", "retail", "US", "store-associate", "list", "Store Associate High-Volume Hiring",
   "Freshmart hires part-time and full-time Store Associates for 300 grocery stores.",
   [("Online Application", "Knockout questions on age (18+) and weekend availability.", "HR Coordinator"),
    ("Situational Judgement Assessment", "15-minute customer service assessment.", "HR Coordinator"),
    ("Store Manager Interview", "", "Store Manager"), ("Background Check", "", "HR Coordinator"),
    ("Offer", "", "Store Manager"), ("I-9 Verification", "Completed on or before the first day.", "HR Coordinator")],
   [("Store Manager", "is the hiring manager."), ("Assistant Store Manager", "can interview when the Store Manager is unavailable."),
    ("District Manager", "approves requisitions and pay exceptions."), ("HR Coordinator", "owns checks and paperwork.")],
   ["Requisitions require District Manager approval.",
    "Starting pay above the standard rate requires District Manager approval.",
    "Rehiring a former employee requires the HR Coordinator to confirm rehire eligibility."])
co("RET-002", "Urban Threads", "retail", "US", "store-associate", "table", "Retail Associate Hiring Configuration",
   "Urban Threads is a fashion retailer hiring Sales Associates, including seasonal hires.",
   [("Online Application", "", "HR Coordinator"),
    ("Text-Message Pre-Screen", "Automated text conversation that checks availability.", "HR Coordinator"),
    ("Group Interview", "", "Store Manager"), ("Store Manager Interview", "", "Store Manager"),
    ("Offer", "", "Store Manager"), ("Background Check", "Run after the offer; the offer is contingent on it.", "HR Coordinator")],
   [("Store Manager", "is the hiring manager."), ("District Manager", "approves exceptions."),
    ("HR Coordinator", "owns background checks.")],
   ["Starting pay above the standard rate requires District Manager approval.",
    "Seasonal requisitions above the store's seasonal headcount plan require District Manager approval."])
co("RET-003", "Homestead Hardware", "retail", "US", "store-associate", "notes", "Workshop Notes: Store Hiring",
   "Attendees: Homestead HR Director, two Store Managers, iCIMS consultant.",
   [("Online Application", "", ""), ("Assessment", "customer service and basic math", ""),
    ("Department Supervisor Interview", "", ""), ("Store Manager Interview", "", ""),
    ("Background Check", "", ""), ("Drug Test", "", ""), ("Offer", "", "")],
   [("Department Supervisor", "first interview"), ("Store Manager", "hiring decision"), ("District Manager", ""),
    ("HR Coordinator", "")],
   ["Requisitions require District Manager approval.",
    "Starting pay above the standard rate requires District Manager approval."],
   ["Decision: the drug test is required for all store roles, not only forklift operators."])
co("RET-004", "Maple Market", "retail", "CA", "store-associate", "list", "Store Associate Hiring Summary (Canada)",
   "Maple Market hires Store Associates for grocery stores in Ontario and Quebec.",
   [("Online Application", "Bilingual application form (English and French).", "HR Coordinator"),
    ("Store Manager Interview", "", "Store Manager"), ("Reference Check", "", "Store Manager"),
    ("Offer", "", "Store Manager")],
   [("Store Manager", "is the hiring manager and owns the offer."), ("District Manager", "approves requisitions.")],
   ["Requisitions require District Manager approval.",
    "Starting pay above the standard rate requires District Manager approval."],
   ["Maple Market does not use an assessment or a background check for Store Associates."])
co("RET-005", "Sunrise Pharmacy", "retail", "US", "store-associate", "table", "Pharmacy Retail Associate Configuration",
   "Sunrise Pharmacy hires front-store Retail Associates.",
   [("Online Application", "", "HR Coordinator"), ("Assessment", "", "HR Coordinator"),
    ("Store Manager Interview", "", "Store Manager"), ("Background Check", "", "HR Coordinator"),
    ("Drug Test", "", "HR Coordinator"), ("Offer", "", "Store Manager"), ("I-9 Verification", "", "HR Coordinator")],
   [("Store Manager", "is the hiring manager."), ("District Manager", "approves requisitions."),
    ("HR Coordinator", "owns checks.")],
   ["Requisitions require approval from the District Manager and Finance.",
    "Starting pay above the standard rate requires District Manager approval."])

# ---------------------------------------------------------------- automotive / manufacturing-technician
co("AUTO-001", "Ironvale Motors", "automotive", "US", "manufacturing-technician", "list", "Production Technician Hiring Implementation",
   "Ironvale Motors hires Production Technicians for its assembly plants on three shifts.",
   [("Application Review", "", "Recruiter"), ("Recruiter Phone Screen", "Confirms shift availability.", "Recruiter"),
    ("Mechanical Aptitude Test", "30-minute test on tools, measurement, and mechanical reasoning.", "Recruiter"),
    ("Hands-On Skills Demonstration", "Candidate completes a timed assembly task on the plant floor.", "Production Supervisor"),
    ("Production Supervisor Interview", "", "Production Supervisor"), ("Background Check", "", "Plant HR Manager"),
    ("Drug Screen", "", "Plant HR Manager"), ("Pre-Employment Physical", "Includes a lifting test.", "Safety Coordinator"),
    ("Offer", "", "Plant HR Manager")],
   [("Recruiter", "screens and schedules."), ("Production Supervisor", "is the hiring manager."),
    ("Plant HR Manager", "owns checks and offers."), ("Safety Coordinator", "owns the physical.")],
   ["Requisitions require approval from the Plant Manager and Finance.",
    "Shift premiums above policy require Plant HR Manager approval.",
    "Offers for union-represented positions must be approved by Labor Relations."])
co("AUTO-002", "Torque Dynamics", "automotive", "MX", "manufacturing-technician", "table", "Technician Hiring Configuration (Mexico)",
   "Torque Dynamics hires Manufacturing Technicians at its Monterrey plant.",
   [("Application Review", "", "Recruiter"), ("Recruiter Screen", "", "Recruiter"),
    ("Aptitude Test", "", "Recruiter"), ("Supervisor Interview", "", "Production Supervisor"),
    ("Medical Exam", "", "Plant HR Manager"), ("Background Check", "", "Plant HR Manager"),
    ("Offer", "", "Plant HR Manager")],
   [("Recruiter", "screens applicants."), ("Production Supervisor", "is the hiring manager."),
    ("Plant HR Manager", "owns checks and offers.")],
   ["Requisitions require approval from the Plant Manager and Finance."])
co("AUTO-003", "Delta Drive Components", "automotive", "US", "manufacturing-technician", "notes", "Workshop Notes: Plant Hiring",
   "Attendees: Delta Drive Plant HR Manager, Production Supervisor, Labor Relations, iCIMS consultant.",
   [("Application Review", "", ""), ("Mechanical Aptitude Test", "", ""),
    ("Plant Tour", "candidates see the work environment before interviewing", ""),
    ("Hands-On Skills Demonstration", "", ""), ("Supervisor Interview", "", ""),
    ("Drug Screen", "", ""), ("Background Check", "", ""), ("Offer", "", "")],
   [("Production Supervisor", "hiring manager"), ("Plant HR Manager", "owns offers"), ("Labor Relations", "reviews union offers")],
   ["Requisitions require approval from the Plant Manager and Finance.",
    "Offers for union-represented positions must be approved by Labor Relations."],
   ["Decision: Delta Drive does NOT do a recruiter phone screen.",
    "Decision: no pre-employment physical."])
co("AUTO-004", "Autoforge", "automotive", "DE", "manufacturing-technician", "list", "Technician Recruiting Design (Germany)",
   "Autoforge hires Mechatronics Technicians for its Stuttgart plant.",
   [("Application Review", "Recruiter checks vocational qualification (Ausbildung).", "Recruiter"),
    ("Recruiter Screen", "", "Recruiter"), ("Technical Skills Test", "", "Production Supervisor"),
    ("Supervisor Interview", "", "Production Supervisor"),
    ("Occupational Medical Exam", "", "Plant HR Manager"), ("Offer", "", "Plant HR Manager")],
   [("Recruiter", "screens applicants."), ("Production Supervisor", "is the hiring manager."),
    ("Plant HR Manager", "owns the offer.")],
   ["Requisitions require approval from the Plant Manager and Finance.",
    "Every hire requires Works Council approval before the offer is sent."])
co("AUTO-005", "Crestline EV", "automotive", "US", "manufacturing-technician", "table", "Battery Plant Technician Configuration",
   "Crestline EV hires Production Technicians for its battery plant.",
   [("Application Review", "", "Recruiter"), ("Recruiter Phone Screen", "", "Recruiter"),
    ("Mechanical Aptitude Test", "", "Recruiter"), ("Hands-On Skills Demonstration", "", "Production Supervisor"),
    ("Supervisor Interview", "", "Production Supervisor"), ("Background Check", "", "Plant HR Manager"),
    ("Drug Screen", "", "Plant HR Manager"), ("Pre-Employment Physical", "", "Safety Coordinator"),
    ("Offer", "", "Plant HR Manager")],
   [("Recruiter", "screens and schedules."), ("Production Supervisor", "is the hiring manager."),
    ("Plant HR Manager", "owns offers."), ("Safety Coordinator", "owns the physical.")],
   ["Requisitions require approval from the Plant Manager and Finance.",
    "Shift premiums above policy require Plant HR Manager approval."])

# ---------------------------------------------------------------- healthcare / nursing (adds to HC-001, HC-002)
co("HC-003", "Summitview Hospital", "healthcare", "US", "nursing", "table", "RN Hiring Configuration",
   "Summitview Hospital hires Registered Nurses for inpatient units.",
   [("Application Review", "", "Recruiter"), ("Recruiter Phone Screen", "", "Recruiter"),
    ("Nurse Manager Interview", "", "Nurse Manager"), ("Peer Interview", "", "Nurse Manager"),
    ("License Verification", "", "HR Generalist"), ("Background Check", "", "HR Generalist"),
    ("Drug Screen", "", "HR Generalist"), ("Occupational Health Screening", "", "HR Generalist"),
    ("Offer", "", "HR Generalist")],
   [("Recruiter", "screens applicants."), ("Nurse Manager", "is the hiring manager."),
    ("HR Generalist", "owns checks and offers.")],
   ["Requisitions require approval from the Unit Director and Finance.",
    "Shift differentials above policy require Chief Nursing Officer approval."])
co("HC-004", "Bayside Children's Hospital", "healthcare", "US", "nursing", "notes", "Workshop Notes: Nurse Hiring",
   "Attendees: Bayside Nurse Recruiter, Nurse Manager (PICU), iCIMS consultant.",
   [("Application Review", "", ""), ("Recruiter Screen", "", ""),
    ("Clinical Skills Assessment", "pediatric medication calculation test", ""),
    ("Nurse Manager Interview", "", ""), ("License Verification", "", ""), ("Background Check", "", ""),
    ("Occupational Health Screening", "", ""), ("Offer", "", "")],
   [("Recruiter", ""), ("Nurse Manager", "hiring manager"), ("HR Generalist", "")],
   ["Requisitions require approval from the Unit Director and Finance.",
    "Sign-on bonuses require approval from the Chief Nursing Officer and Finance."],
   ["Decision: Bayside does NOT use a peer interview."])
co("HC-005", "Thamesbridge NHS Trust", "healthcare", "UK", "nursing", "list", "Registered Nurse Recruitment (UK)",
   "Thamesbridge NHS Trust recruits Band 5 Registered Nurses.",
   [("Application Review", "Shortlisting against the person specification.", "Recruiter"),
    ("Values-Based Interview", "", "Ward Manager"), ("Clinical Scenario Assessment", "", "Ward Manager"),
    ("NMC Registration Check", "", "Recruiter"), ("Enhanced DBS Check", "", "Recruiter"),
    ("Occupational Health Clearance", "", "Recruiter"), ("Reference Check", "", "Recruiter"),
    ("Offer", "Conditional offer issued after interview; unconditional after checks.", "Recruiter")],
   [("Recruiter", "owns pre-employment checks."), ("Ward Manager", "is the hiring manager.")],
   ["Requisitions require approval from the Divisional Director and Finance.",
    "Recruitment and retention premiums require approval from the Director of Nursing."])

# ---------------------------------------------------------------- hospitality / front-desk-agent
co("HOSP-001", "Grand Azure Hotels", "hospitality", "US", "front-desk-agent", "list", "Front Desk Agent Hiring",
   "Grand Azure Hotels hires Front Desk Agents for full-service hotels.",
   [("Application Review", "", "Recruiter"), ("Recruiter Phone Screen", "", "Recruiter"),
    ("Front Office Manager Interview", "", "Front Office Manager"),
    ("Guest Scenario Role-Play", "Candidate handles a mock guest complaint at check-in.", "Front Office Manager"),
    ("Background Check", "", "HR Coordinator"), ("Offer", "", "HR Coordinator")],
   [("Recruiter", "screens."), ("Front Office Manager", "is the hiring manager."), ("HR Coordinator", "owns checks and offers.")],
   ["Requisitions require approval from the General Manager and Finance.",
    "Starting pay above the standard rate requires General Manager approval."])
co("HOSP-002", "Palmcrest Resorts", "hospitality", "AE", "front-desk-agent", "table", "Guest Services Agent Configuration (UAE)",
   "Palmcrest Resorts hires Guest Services Agents, many relocating internationally.",
   [("Application Review", "", "Recruiter"), ("Video Interview", "One-way recorded video interview.", "Recruiter"),
    ("Front Office Manager Interview", "", "Front Office Manager"),
    ("Guest Scenario Role-Play", "", "Front Office Manager"),
    ("Background Check", "", "HR Coordinator"), ("Medical Fitness Test", "", "HR Coordinator"),
    ("Offer", "", "HR Coordinator")],
   [("Recruiter", "screens."), ("Front Office Manager", "is the hiring manager."), ("HR Coordinator", "owns visa and offer.")],
   ["Requisitions require approval from the General Manager and Finance.",
    "Visa sponsorship requires HR Director approval."])
co("HOSP-003", "Harbor Inn Group", "hospitality", "US", "front-desk-agent", "notes", "Workshop Notes: Front Desk Hiring",
   "Attendees: Harbor Inn Area HR Manager, Front Office Manager, iCIMS consultant.",
   [("Application Review", "", ""), ("Front Office Manager Interview", "", ""),
    ("Shadow Shift", "two-hour paid shadow shift at the front desk", ""),
    ("Background Check", "", ""), ("Offer", "", "")],
   [("Front Office Manager", "hiring manager"), ("HR Coordinator", "")],
   ["Starting pay above the standard rate requires General Manager approval."],
   ["Decision: Harbor Inn does NOT do a recruiter phone screen."])
co("HOSP-004", "Alpine Lodge Collection", "hospitality", "CH", "front-desk-agent", "list", "Receptionist Hiring (Switzerland)",
   "Alpine Lodge Collection hires multilingual Front Desk Receptionists.",
   [("Application Review", "", "Recruiter"), ("Recruiter Phone Screen", "", "Recruiter"),
    ("Front Office Manager Interview", "", "Front Office Manager"),
    ("Language Assessment", "German, English, and French spoken assessment.", "Recruiter"),
    ("Reference Check", "", "Recruiter"), ("Offer", "", "Front Office Manager")],
   [("Recruiter", "screens and runs language assessment."), ("Front Office Manager", "is the hiring manager.")],
   ["Starting pay above the standard rate requires General Manager approval."])


# ---------------------------------------------------------------- answer keys for the hand-written docs
# AIR-* and HC-001/002 are written by hand (not generated), so their answer keys are written by hand too.
# Approval rules are the exact sentence from the doc; stages/roles are the names as the doc states them.
MANUAL_GOLD = {
    "AIR-001": {"STAGE": ["Application Review", "Recruiter Phone Screen", "Written Technical Assessment", "Simulator Evaluation",
                          "Panel Interview", "Background Check", "Medical Verification", "Pre-Employment Drug Test", "Offer"],
                "ROLE": ["Recruiter", "Simulator Check Airman", "Chief Pilot", "HR Business Partner"],
                "APPROVAL_RULE": ["Every requisition must be approved by the Director of Flight Operations and Finance before it is posted.",
                                  "Any offer above the standard First Officer pay band requires approval from the VP of Flight Operations and the HR Director.",
                                  "Sign-on bonuses must be approved by Finance."]},
    "AIR-002": {"STAGE": ["Resume Screening", "HR Screen", "Knowledge Test", "Sim Check", "Captain Interview",
                          "Background & PRIA Check", "First-Class Medical Verification", "DOT Drug Screen", "Offer"],
                "ROLE": ["Recruiter", "Fleet Captain", "Simulator Check Airman", "HR Business Partner"],
                "APPROVAL_RULE": ["Requisitions are opened by the Fleet Captain and require sign-off from the Director of Flight Operations and Finance.",
                                  "Offers above the standard pay band need approval from the VP Flight Operations and the HR Director.",
                                  "Credit for prior experience toward seniority must be approved by the Chief Pilot."]},
    "AIR-003": {"STAGE": ["Application Review", "Recruiter Phone Screen", "Written Technical Assessment", "Panel Interview",
                          "Background Check", "Pre-Employment Drug Test", "Offer"],
                "ROLE": ["Recruiter", "Chief Pilot", "HR Business Partner"],
                "APPROVAL_RULE": ["Every requisition needs approval from the Director of Flight Operations and Finance before posting.",
                                  "Any offer above the standard pay band requires approval from the VP of Flight Operations and the HR Director.",
                                  "Sign-on bonuses require Finance approval."]},
    "AIR-004": {"STAGE": ["Application Review", "Recruiter Phone Screen", "Simulator Evaluation", "Panel Interview",
                          "Background Check", "Medical Verification", "Pre-Employment Drug Test", "Offer"],
                "ROLE": ["Recruiter", "Simulator Check Airman", "Chief Pilot", "HR Business Partner"],
                "APPROVAL_RULE": ["Requisitions require approval from the Director of Flight Operations and Finance.",
                                  "Offers above the standard pay band require approval from the VP of Flight Operations and the HR Director.",
                                  "Sign-on bonuses require Finance approval.",
                                  "Credit for prior experience toward seniority must be approved by the Chief Pilot."]},
    "AIR-005": {"STAGE": ["Application Review", "Recruiter Phone Screen", "Written Technical Assessment", "Simulator Evaluation",
                          "Panel Interview", "Background Check", "Medical Verification", "Offer"],
                "ROLE": ["Recruiter", "Simulator Check Airman", "Director of Flight Operations", "HR Business Partner"],
                "APPROVAL_RULE": ["All requisitions require approval by the Director of Flight Operations and Finance.",
                                  "Offers above the standard pay band require approval from the VP of Flight Operations and the HR Director."]},
    "AIR-006": {"STAGE": ["Application Review", "Online Knowledge Test", "Simulator Evaluation", "Panel Interview",
                          "Background Check", "Medical Verification", "Offer"],
                "ROLE": ["Recruiter", "Simulator Check Airman", "Chief Pilot", "HR Business Partner"],
                "APPROVAL_RULE": ["Requisitions require approval from the Director of Flight Operations.",
                                  "Sign-on bonuses require Finance approval."]},
    "HC-001": {"STAGE": ["Application Review", "Recruiter Phone Screen", "Nurse Manager Interview", "Skills Checklist",
                         "License Verification", "Background Check", "Occupational Health Screening", "Offer"],
               "ROLE": ["Recruiter", "Nurse Manager", "HR Generalist"],
               "APPROVAL_RULE": ["Requisitions require approval from the Unit Director and Finance.",
                                 "Offers with shift differentials above policy require approval from the Chief Nursing Officer."]},
    "HC-002": {"STAGE": ["Application Review", "Recruiter Screen", "Peer Interview", "Nurse Manager Interview",
                         "License Verification", "Background Check", "Occupational Health Screening", "Offer"],
               "ROLE": ["Recruiter", "Nurse Manager", "Staff Nurse interviewers", "HR Generalist"],
               "APPROVAL_RULE": ["Requisitions require approval from the Unit Director and Finance.",
                                 "Sign-on bonuses require approval from the Chief Nursing Officer and Finance."]},
}


# ---------------------------------------------------------------- rendering
def render(c):
    head = f"# FICTIONAL — {c['name']}: {c['title']}\n\n*Synthetic sample data. Approved by customer project lead.*\n\n{c['intro']}\n\n"
    if c["fmt"] == "list":
        body = "## Hiring stages\n" + "".join(
            f"{i}. **{n}**" + (f" – {d}" if d else "") + "\n" for i, (n, d, _) in enumerate(c["stages"], 1))
        body += "\n## Roles\n" + "".join(f"- **{r}**" + (f" – {d}" if d else "") + "\n" for r, d in c["roles"])
        body += "\n## Approval rules\n" + "".join(f"- {a}\n" for a in c["approvals"])
        body += "".join(f"\nNote: {n}\n" for n in c["notes"])
    elif c["fmt"] == "table":
        body = "### Stage configuration\n| Order | Stage | Owner |\n|---|---|---|\n" + "".join(
            f"| {i} | {n} | {o} |\n" for i, (n, _, o) in enumerate(c["stages"], 1))
        details = [f"- {n}: {d}\n" for n, d, _ in c["stages"] if d]
        if details:
            body += "\nStage details:\n" + "".join(details)
        body += "\n### Roles\n" + "".join(f"- {r}" + (f": {d}" if d else "") + "\n" for r, d in c["roles"])
        body += "\n### Approvals\n" + "".join(f"- {a}\n" for a in c["approvals"])
        body += "".join(f"\n{n}\n" for n in c["notes"])
    else:  # meeting notes
        body = "Agreed hiring workflow:\n" + "".join(
            f"- Step {i}, {n}" + (f": {d}." if d else ".") + "\n" for i, (n, d, _) in enumerate(c["stages"], 1))
        body += "\n" + "".join(f"{n}\n\n" for n in c["notes"])
        body += "Roles confirmed: " + "; ".join(r + (f" ({d})" if d else "") for r, d in c["roles"]) + ".\n\n"
        body += "Approval rules agreed:\n" + "".join(f"- {a}\n" for a in c["approvals"])
    return head + body


def slug(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def main():
    manifest = DOCS / "manifest.csv"
    generated = {c["doc_id"] for c in C}
    with manifest.open() as f:
        rows = [r for r in csv.reader(f) if r and r[0] not in generated]
    for old in DOCS.glob("*.md"):  # drop stale files from earlier runs
        if old.name.split("_", 1)[0] in generated:
            old.unlink()
    for c in C:
        fn = f"{c['doc_id']}_{slug(c['name'])}.md"
        (DOCS / fn).write_text(render(c))
        rows.append([c["doc_id"], fn, c["industry"], c["geo"], c["workflow"]])
    with manifest.open("w", newline="") as f:
        csv.writer(f, lineterminator="\n").writerows(rows)
    # Answer key for the accuracy eval (GET /api/eval/...): hand-written MANUAL_GOLD + generated docs.
    gold = dict(MANUAL_GOLD)
    gold |= {c["doc_id"]: {"STAGE": [n for n, _, _ in c["stages"]], "ROLE": [r for r, _ in c["roles"]],
                          "APPROVAL_RULE": c["approvals"]} for c in C}
    (DOCS / "ground_truth.json").write_text(json.dumps(gold, indent=1))
    print(f"wrote {len(C)} docs; manifest has {len(rows) - 1} docs")


if __name__ == "__main__":
    main()
