import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getDatabase, ref, set, onValue, off, update, push, get,
} from "firebase/database";


import IIM_LOGO from "./img/logo.png";

// ─── INJECT SIGURD FONT GLOBALLY ────────────────────────────
if (typeof document !== "undefined") {
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');
    *, *::before, *::after { font-family: 'Nunito', 'Avenir Next', 'Avenir', system-ui, sans-serif !important; }
    input, button, textarea, select { font-family: 'Nunito', 'Avenir Next', 'Avenir', system-ui, sans-serif !important; }
  `;
  document.head.prepend(styleEl);
}
// ─── FIREBASE CONFIG ──────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBhwi46xd_LNKPGcG8yA-XgMIQ4Sox6u4A",
  authDomain: "iimshillong-elective.firebaseapp.com",
  databaseURL: "https://iimshillong-elective-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "iimshillong-elective",
  storageBucket: "iimshillong-elective.firebasestorage.app",
  messagingSenderId: "249623886303",
  appId: "1:249623886303:web:bf9eeb37b490953e17ec6a",
  measurementId: "G-2XN8V4J992"
};
const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const db          = getDatabase(firebaseApp);

// ─── AUCTION TIMING ───────────────────────────────────────────
const ROUND_MS = 2 * 60 * 60 * 1000; // 2 hours

function currentRoundStart() {
  const now      = Date.now();
  const dayStart = Math.floor(now / 86400000) * 86400000;
  const elapsed  = now - dayStart;
  return dayStart + Math.floor(elapsed / ROUND_MS) * ROUND_MS;
}
function nextRoundStart()   { return currentRoundStart() + ROUND_MS; }
function msUntilNextRound() { return nextRoundStart() - Date.now(); }

const pad2   = (n) => String(Math.max(0, n)).padStart(2, "0");
function fmtMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}
function fmtDateTime(ts) {
  return new Date(ts).toLocaleString("en-IN", {
    day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit", hour12:true,
  });
}

// ─── BID RULES ────────────────────────────────────────────────
const TOTAL_TOKENS = 2300;

function bidLimits(course) {
  const max = course.term < 6 ? 800 : 700;
  const min = course.defaultBid ?? (course.credits >= 4 ? 100 : 50);
  return { min, max };
}

// ─── CREDIT / TERM RULES ─────────────────────────────────────
const TERM_RULES   = { 4:{ min:12, max:20 }, 5:{ min:12, max:20 }, 6:{ min:8, max:20 } };
const CLUSTER_MIN  = { 1:12, 2:12, 3:8 };
const TOTAL_CR_MIN = 48, TOTAL_CR_MAX = 52;

// ─── SUBJECTS SEED (from Elective_Bid.xlsx — 80 courses) ─────
// defaultBid: 100 for 4-credit courses, 50 for 2-credit courses
const SUBJECTS_SEED = {
  "PGPEFC402": {"id": "PGPEFC402", "title": "FinTech", "prof": "Prof. Mousumi Bhattacharya", "prereq": "", "credits": 4, "sections": 1, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPESL401": {"id": "PGPESL401", "title": "Corporate Strategy", "prof": "Prof. Debasisha Mishra", "prereq": "", "credits": 4, "sections": 2, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPESL403": {"id": "PGPESL403", "title": "Strategy Consulting", "prof": "Prof. Sanjay Yashroy (Adjunct Faculty)", "prereq": "Strategic Management", "credits": 4, "sections": 1, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPEEP401": {"id": "PGPEEP401", "title": "Game Theory for Business Leaders (GTBL)", "prof": "Prof. Subhadip Mukherjee", "prereq": "Microeconomics and Macroeconomics", "credits": 4, "sections": 2, "cluster": 2, "term": 4, "defaultBid": 100},
  "PGPEFC401": {"id": "PGPEFC401", "title": "Investment Banking & Business Valuation", "prof": "Prof. Naliniprava Tripathy", "prereq": "At least (B-) grade in Finance Term-2", "credits": 4, "sections": 2, "cluster": 2, "term": 4, "defaultBid": 100},
  "PGPEFC404": {"id": "PGPEFC404", "title": "Security Analysis and Portfolio Management", "prof": "Prof. Sharad Nath Bhattacharya", "prereq": "At least B- grade in Financial Management and Financial Markets", "credits": 4, "sections": 2, "cluster": 2, "term": 4, "defaultBid": 100},
  "PGPEIA403": {"id": "PGPEIA403", "title": "Business Intelligence & Analytics", "prof": "Prof. Basav Roychoudhury", "prereq": "", "credits": 4, "sections": 1, "cluster": 2, "term": 4, "defaultBid": 100},
  "PGPEOQ401": {"id": "PGPEOQ401", "title": "Project Management", "prof": "Prof. Pradeep Rathore", "prereq": "", "credits": 4, "sections": 1, "cluster": 2, "term": 4, "defaultBid": 100},
  "PGPESL502": {"id": "PGPESL502", "title": "Strategy Consulting", "prof": "Prof. Sanjay Yashroy (Adjunct Faculty)", "prereq": "Strategic Management", "credits": 4, "sections": 1, "cluster": 1, "term": 5, "defaultBid": 100},
  "PGPEFC501": {"id": "PGPEFC501", "title": "Mergers, Acquisitions and Corporate Restructurings", "prof": "Prof. Mousumi Bhattacharya", "prereq": "", "credits": 4, "sections": 2, "cluster": 2, "term": 5, "defaultBid": 100},
  "PGPEFC504": {"id": "PGPEFC504", "title": "Financial Engineering", "prof": "Visiting Faculty (TBD)", "prereq": "Financial Management and Financial Markets", "credits": 4, "sections": 1, "cluster": 2, "term": 5, "defaultBid": 100},
  "PGPEMK502": {"id": "PGPEMK502", "title": "Sustainability Marketing", "prof": "Visiting Faculty (TBD)", "prereq": "Marketing Core Courses", "credits": 4, "sections": 1, "cluster": 3, "term": 5, "defaultBid": 100},
  "PGPESL503": {"id": "PGPESL503", "title": "Wisdom Leadership: East-West Perspectives", "prof": "Prof. Sanjoy Mukherjee", "prereq": "", "credits": 2, "sections": 2, "cluster": 3, "term": 5, "defaultBid": 50},
  "PGPEFC601": {"id": "PGPEFC601", "title": "Wealth Management & Fin Tech", "prof": "Prof. Neelam Rani", "prereq": "Financial Management", "credits": 4, "sections": 1, "cluster": 1, "term": 6, "defaultBid": 100},
  "PGPEEP602": {"id": "PGPEEP602", "title": "Business Decision Making under Uncertainty (BDMU)", "prof": "Prof. Subhadip Mukherjee", "prereq": "Managerial Economics and Macroeconomics", "credits": 4, "sections": 2, "cluster": 2, "term": 6, "defaultBid": 100},
  "PGPEMK603": {"id": "PGPEMK603", "title": "Social Marketing", "prof": "Prof. Vibhas Amawate", "prereq": "Core Courses in Marketing including Marketing Management and Marketing Strategy", "credits": 2, "sections": 1, "cluster": 3, "term": 6, "defaultBid": 50},
  "PGPESL602": {"id": "PGPESL602", "title": "Entrepreneurship & New Venture Management – A Practitioner’s Perspective", "prof": "Prof. Sanjay Yashroy (Adjunct Faculty)", "prereq": "Core courses in Strategy, Marketing, OB, Operations, Corporate Finance", "credits": 4, "sections": 1, "cluster": 3, "term": 6, "defaultBid": 100},
  "PGPEEP402": {"id": "PGPEEP402", "title": "Geopolitical Risks & their impact on Supply Chains & Trade Flows", "prof": "Mr. Punit Oza (Visiting Faculty)", "prereq": "Microeconomics and Macroeconomics", "credits": 4, "sections": 1, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPEFC405": {"id": "PGPEFC405", "title": "Banking: Policies and Practice", "prof": "Prof. Varnita Srivastava, Prof. M. D. Patra (Visiting Faculty)", "prereq": "", "credits": 4, "sections": 1, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPEMK401": {"id": "PGPEMK401", "title": "Retail Management", "prof": "Prof. Bidyut J. Gogoi", "prereq": "Marketing Management", "credits": 4, "sections": 2, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPEMK402": {"id": "PGPEMK402", "title": "Integrated Marketing Communications", "prof": "Prof. Pratap Chandra Mandal", "prereq": "Marketing Management", "credits": 4, "sections": 1, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPEMK403": {"id": "PGPEMK403", "title": "Customer Relationship Management", "prof": "Prof. Pratap Chandra Mandal", "prereq": "Marketing Management", "credits": 4, "sections": 1, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPEMK404": {"id": "PGPEMK404", "title": "Brand Management", "prof": "Visiting Faculty (TBD)", "prereq": "Marketing Management", "credits": 4, "sections": 1, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPEMK406": {"id": "PGPEMK406", "title": "Sales & Distribution Management", "prof": "Prof. Ramendra Singh (Visiting Faculty)", "prereq": "Marketing Management", "credits": 4, "sections": 1, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPEMK407": {"id": "PGPEMK407", "title": "Consumer Behavior", "prof": "Mr. Aruni Ghosh (Visiting Faculty)", "prereq": "Marketing Management, Marketing Strategy", "credits": 4, "sections": 1, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPEMK410": {"id": "PGPEMK410", "title": "Business to Business Marketing", "prof": "Prof. Vibhas Amawate", "prereq": "Core Courses in Marketing including Marketing Management and Marketing Strategy", "credits": 4, "sections": 1, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPEOB401": {"id": "PGPEOB401", "title": "Well-being at Work", "prof": "Prof. Sitanshu Sekhar Das", "prereq": "Self and Group Dynamics", "credits": 4, "sections": 1, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPEOB404": {"id": "PGPEOB404", "title": "People Practices for International Assignments", "prof": "Prof. Priya Alat", "prereq": "", "credits": 2, "sections": 1, "cluster": 1, "term": 4, "defaultBid": 50},
  "PGPEOQ402": {"id": "PGPEOQ402", "title": "Operation Strategy for Competitive Advantage", "prof": "Prof. Jose Arturo Garza-Reyes (Adjunct Faculty)", "prereq": "Operations Management", "credits": 4, "sections": 1, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPEOQ405": {"id": "PGPEOQ405", "title": "Industry 4.0 and Business Application", "prof": "Prof. Krantiraditya Dhalmahapatra", "prereq": "Management Information System", "credits": 4, "sections": 2, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPESL404": {"id": "PGPESL404", "title": "Strategies for International Markets: Challenges and Opportunities", "prof": "Prof. Sheetal", "prereq": "Strategic Management", "credits": 4, "sections": 2, "cluster": 1, "term": 4, "defaultBid": 100},
  "PGPEFC403": {"id": "PGPEFC403", "title": "Fixed Income Securities", "prof": "Prof. Neelam Rani", "prereq": "", "credits": 4, "sections": 1, "cluster": 2, "term": 4, "defaultBid": 100},
  "PGPEIA402": {"id": "PGPEIA402", "title": "Data Analysis using Python", "prof": "Prof. Pradeep Kumar Dadabada", "prereq": "", "credits": 4, "sections": 1, "cluster": 2, "term": 4, "defaultBid": 100},
  "PGPEMK405": {"id": "PGPEMK405", "title": "Digital Marketing & E-Commerce", "prof": "Prof. Teidorlang Lyngdoh", "prereq": "Marketing Management", "credits": 4, "sections": 1, "cluster": 2, "term": 4, "defaultBid": 100},
  "PGPEOB402": {"id": "PGPEOB402", "title": "Human Resource Analytics", "prof": "Prof. Ashutosh Murti", "prereq": "All Core HR & OB Area Paper", "credits": 4, "sections": 1, "cluster": 2, "term": 4, "defaultBid": 100},
  "PGPEOQ403": {"id": "PGPEOQ403", "title": "Environmental Sustainability and Life Cycle Assessment", "prof": "Prof. Kailash Choudhary", "prereq": "", "credits": 4, "sections": 1, "cluster": 2, "term": 4, "defaultBid": 100},
  "PGPEOQ404": {"id": "PGPEOQ404", "title": "Advanced Operations Research", "prof": "Prof. Kailash Choudhary", "prereq": "Operations Research", "credits": 4, "sections": 1, "cluster": 2, "term": 4, "defaultBid": 100},
  "PGPEOQ406": {"id": "PGPEOQ406", "title": "Supply Chain Management", "prof": "Prof. Yadav Vinay Surendra", "prereq": "Operations Management and Operations Research", "credits": 4, "sections": 2, "cluster": 2, "term": 4, "defaultBid": 100},
  "PGPEIA401": {"id": "PGPEIA401", "title": "Digital Business & Transformation Strategies", "prof": "Prof. Parijat Upadhyay", "prereq": "", "credits": 4, "sections": 2, "cluster": 3, "term": 4, "defaultBid": 100},
  "PGPEMK408": {"id": "PGPEMK408", "title": "Entertainment, Sports, and Cultural Marketing", "prof": "Prof. Ravi Shankar Bhakat", "prereq": "Marketing Basic Course", "credits": 4, "sections": 1, "cluster": 3, "term": 4, "defaultBid": 100},
  "PGPEMK409": {"id": "PGPEMK409", "title": "Marketing for Public Participation Policy and Governance", "prof": "Prof. Ravi Shankar Bhakat", "prereq": "Marketing Basic Course", "credits": 2, "sections": 1, "cluster": 3, "term": 4, "defaultBid": 50},
  "PGPEOB403": {"id": "PGPEOB403", "title": "Indigenous Communities, Organizations & Markets", "prof": "Ms. Juhi Pandey and Prof. Rohit Dwivedi", "prereq": "", "credits": 4, "sections": 1, "cluster": 3, "term": 4, "defaultBid": 100},
  "PGPESL402": {"id": "PGPESL402", "title": "Management: Past, Present and Future", "prof": "Prof. Sanjoy Mukherjee", "prereq": "", "credits": 2, "sections": 2, "cluster": 3, "term": 4, "defaultBid": 50},
  "PGPEFC502": {"id": "PGPEFC502", "title": "Behavioural Finance and Value Investing", "prof": "Prof. Neelam Rani", "prereq": "Basic Knowledge of Financial Management", "credits": 4, "sections": 2, "cluster": 1, "term": 5, "defaultBid": 100},
  "PGPEFC503": {"id": "PGPEFC503", "title": "Sustainable Finance", "prof": "Prof. Varnita Srivastava", "prereq": "", "credits": 4, "sections": 1, "cluster": 1, "term": 5, "defaultBid": 100},
  "PGPEMK503": {"id": "PGPEMK503", "title": "Services Marketing", "prof": "Prof. Vibhas Amawate", "prereq": "Core Courses in Marketing including Marketing Management and Marketing Strategy", "credits": 4, "sections": 1, "cluster": 1, "term": 5, "defaultBid": 100},
  "PGPEMK505": {"id": "PGPEMK505", "title": "Product Management", "prof": "Visiting Faculty (TBD)", "prereq": "Marketing Management and Marketing Strategy", "credits": 4, "sections": 1, "cluster": 1, "term": 5, "defaultBid": 100},
  "PGPEOB502": {"id": "PGPEOB502", "title": "Talent and Performance Management System (TPMS)", "prof": "Prof. Sitanshu Sekhar Das", "prereq": "Human Capital Management", "credits": 4, "sections": 1, "cluster": 1, "term": 5, "defaultBid": 100},
  "PGPEOB503": {"id": "PGPEOB503", "title": "Negotiation and Conflict Management (NCM)", "prof": "Prof. Sitanshu Sekhar Das", "prereq": "SGD, TBL, HCM", "credits": 4, "sections": 1, "cluster": 1, "term": 5, "defaultBid": 100},
  "PGPEOB506": {"id": "PGPEOB506", "title": "Agile Leadership for Future of Work & Workplace", "prof": "Dr. Ranjan Kumar Mohapatra (Visiting Faculty)", "prereq": "Core paper", "credits": 4, "sections": 1, "cluster": 1, "term": 5, "defaultBid": 100},
  "PGPEOQ501": {"id": "PGPEOQ501", "title": "Business Modeling and Simulation", "prof": "Prof. Achinta Kr. Sarmah", "prereq": "Operations Management, Statistical Decision Making", "credits": 4, "sections": 1, "cluster": 1, "term": 5, "defaultBid": 100},
  "PGPEOQ504": {"id": "PGPEOQ504", "title": "Service Operations Management", "prof": "Prof. Krantiraditya Dhalmahapatra", "prereq": "Operations Management, Operation Research", "credits": 4, "sections": 1, "cluster": 1, "term": 5, "defaultBid": 100},
  "PGPEOQ506": {"id": "PGPEOQ506", "title": "Logistics Management", "prof": "Prof. Sanjita Jaipuria", "prereq": "Operations Management", "credits": 4, "sections": 1, "cluster": 1, "term": 5, "defaultBid": 100},
  "PGPEIA501": {"id": "PGPEIA501", "title": "Predictive Analytics for Business Forecasting", "prof": "Prof. Pradeep Kumar Dadabada", "prereq": "Fundamentals of Python/R", "credits": 4, "sections": 1, "cluster": 2, "term": 5, "defaultBid": 100},
  "PGPEIA502": {"id": "PGPEIA502", "title": "Technology Management & IT Consulting", "prof": "Dr. Praveen Chowdhury (Visiting Faculty)", "prereq": "", "credits": 4, "sections": 2, "cluster": 2, "term": 5, "defaultBid": 100},
  "PGPEMK501": {"id": "PGPEMK501", "title": "Marketing Intelligence", "prof": "Prof. Pratap Chandra Mandal", "prereq": "Marketing Management", "credits": 4, "sections": 1, "cluster": 2, "term": 5, "defaultBid": 100},
  "PGPEMK504": {"id": "PGPEMK504", "title": "Marketing Analytics", "prof": "Prof. Saravana Jaikumar (Visiting Faculty)", "prereq": "", "credits": 4, "sections": 1, "cluster": 2, "term": 5, "defaultBid": 100},
  "PGPEOB505": {"id": "PGPEOB505", "title": "Reward Management", "prof": "Prof. Priya Alat", "prereq": "", "credits": 4, "sections": 1, "cluster": 2, "term": 5, "defaultBid": 100},
  "PGPEOQ502": {"id": "PGPEOQ502", "title": "Six Sigma and Lean Thinking", "prof": "Prof. Abhinav Kumar Sharma", "prereq": "Statistics for Decision-Making", "credits": 4, "sections": 2, "cluster": 2, "term": 5, "defaultBid": 100},
  "PGPEOQ503": {"id": "PGPEOQ503", "title": "Environmental Sustainability and Life Cycle Assessment", "prof": "Prof. Kailash Choudhary", "prereq": "", "credits": 4, "sections": 1, "cluster": 2, "term": 5, "defaultBid": 100},
  "PGPEOQ505": {"id": "PGPEOQ505", "title": "Circular Economy", "prof": "Prof. Pradeep Rathore", "prereq": "", "credits": 4, "sections": 2, "cluster": 2, "term": 5, "defaultBid": 100},
  "PGPEEP501": {"id": "PGPEEP501", "title": "Business Governance and Public Policy (BGPP)", "prof": "Prof. Pranab K. Pani (Visiting Faculty)", "prereq": "Managerial Economics and Macroeconomics", "credits": 4, "sections": 1, "cluster": 3, "term": 5, "defaultBid": 100},
  "PGPEOB501": {"id": "PGPEOB501", "title": "Consulting Mosaics", "prof": "Prof. Rohit Dwivedi", "prereq": "", "credits": 4, "sections": 1, "cluster": 3, "term": 5, "defaultBid": 100},
  "PGPEOB504": {"id": "PGPEOB504", "title": "The Startup Chronicles", "prof": "Prof. Ashutosh Murti", "prereq": "All Area Core Paper", "credits": 2, "sections": 1, "cluster": 3, "term": 5, "defaultBid": 50},
  "PGPESL501": {"id": "PGPESL501", "title": "Management Learning from Upanishads and Indian Mythology", "prof": "Prof. Debasisha Mishra", "prereq": "Strategic Management", "credits": 4, "sections": 2, "cluster": 3, "term": 5, "defaultBid": 100},
  "PGPEEP601": {"id": "PGPEEP601", "title": "Current Scenario of the Indian Economy and Business Environment (CSIEBE)", "prof": "Prof. Atul Mehta", "prereq": "Macroeconomics", "credits": 4, "sections": 1, "cluster": 1, "term": 6, "defaultBid": 100},
  "PGPEFC603": {"id": "PGPEFC603", "title": "Sustainability Reporting and Analysis", "prof": "Prof. Vishakha Bansal", "prereq": "Core Subjects", "credits": 4, "sections": 2, "cluster": 1, "term": 6, "defaultBid": 100},
  "PGPEIA601": {"id": "PGPEIA601", "title": "Storytelling Through Data", "prof": "Mr. Ankit Bhargava (Visiting Faculty)", "prereq": "", "credits": 2, "sections": 1, "cluster": 1, "term": 6, "defaultBid": 50},
  "PGPEMK604": {"id": "PGPEMK604", "title": "Luxury Marketing", "prof": "Dr. Sheetal Jain (Visiting Faculty)", "prereq": "", "credits": 2, "sections": 1, "cluster": 1, "term": 6, "defaultBid": 50},
  "PGPEOQ601": {"id": "PGPEOQ601", "title": "Service Operations Management", "prof": "Prof. Achinta Kr. Sarmah", "prereq": "Operations Management, Operation Research", "credits": 4, "sections": 2, "cluster": 1, "term": 6, "defaultBid": 100},
  "PGPEOQ602": {"id": "PGPEOQ602", "title": "Healthcare operations management", "prof": "Prof. Pradeep Rathore", "prereq": "", "credits": 4, "sections": 2, "cluster": 1, "term": 6, "defaultBid": 100},
  "PGPEOQ603": {"id": "PGPEOQ603", "title": "Assessment and Management of Risk", "prof": "Prof. Sanjita Jaipuria", "prereq": "Operations Management", "credits": 4, "sections": 1, "cluster": 1, "term": 6, "defaultBid": 100},
  "PGPEFC604": {"id": "PGPEFC604", "title": "Infrastructure Project Finance", "prof": "Visiting Faculty (TBD)", "prereq": "Corporate Finance", "credits": 4, "sections": 1, "cluster": 2, "term": 6, "defaultBid": 100},
  "PGPEFC602": {"id": "PGPEFC602", "title": "Corporate Governance and Ethics in Finance", "prof": "Prof. Vishakha Bansal and Prof. Varnita Srivastava", "prereq": "Core Subjects", "credits": 4, "sections": 2, "cluster": 3, "term": 6, "defaultBid": 100},
  "PGPEIA602": {"id": "PGPEIA602", "title": "Digital Product Development and Management", "prof": "Dr. Kumar Saurabh (Visiting Faculty)", "prereq": "", "credits": 2, "sections": 1, "cluster": 3, "term": 6, "defaultBid": 50},
  "PGPEMK601": {"id": "PGPEMK601", "title": "Rural Marketing", "prof": "Prof. Ravi Shankar Bhakat", "prereq": "Marketing Basic Courses", "credits": 4, "sections": 1, "cluster": 3, "term": 6, "defaultBid": 100},
  "PGPEMK602": {"id": "PGPEMK602", "title": "Northeast Outbound Challenge: Explore. Engage. Lead.", "prof": "Prof. Teidorlang Lyngdoh", "prereq": "Marketing Management", "credits": 4, "sections": 1, "cluster": 3, "term": 6, "defaultBid": 100},
  "PGPEOB601": {"id": "PGPEOB601", "title": "Leadership Stories", "prof": "Prof. Rohit Dwivedi & Prof. Ashutosh Murti", "prereq": "All Area Core Paper", "credits": 4, "sections": 1, "cluster": 3, "term": 6, "defaultBid": 100},
  "PGPESL601": {"id": "PGPESL601", "title": "Management and Liberal Arts", "prof": "Prof. Sanjoy Mukherjee", "prereq": "", "credits": 2, "sections": 2, "cluster": 3, "term": 6, "defaultBid": 50},
  "PGPESL603": {"id": "PGPESL603", "title": "Chanakya Arthashastra and Niti", "prof": "Prof. Debasisha Mishra", "prereq": "Strategic Management", "credits": 4, "sections": 2, "cluster": 3, "term": 6, "defaultBid": 100},
};
// COURSES is a module-level mutable ref updated once subjects/ loads from Firebase.
// All components read from this array. It starts as the seed so the UI renders
// immediately, then is replaced when Firebase responds.
let COURSES = Object.values(SUBJECTS_SEED);

// ─── DESIGN TOKENS ────────────────────────────────────────────
const THEMES = {
  dark: {
    bg:"#070b10", surface:"#0d1117", card:"#111820",
    border:"#1e2730", borderDim:"#131c24",
    text:"#e8edf3", textSub:"#9ba8b5", textDim:"#4a5568",
    t4:"#f5c842", t5:"#4da6ff", t6:"#ff6b6b",
    c1:"#c084fc", c2:"#4ade80", c3:"#fb923c",
    gold:"#f5c842", silver:"#9ba8b5", bronze:"#cd7f32",
    green:"#22c55e", blue:"#3b82f6", red:"#ef4444", yellow:"#eab308",
    accent:"#4da6ff",
    scrollTrack:"#0d1117", scrollThumb:"#2d3a47", scrollThumbHover:"#3d4e60",
  },
  light: {
    bg:"#f0f4f8", surface:"#ffffff", card:"#f8fafc",
    border:"#d1dae4", borderDim:"#e2eaf2",
    text:"#0f1923", textSub:"#4a6072", textDim:"#94a3b8",
    t4:"#b45309", t5:"#1d4ed8", t6:"#be123c",
    c1:"#7c3aed", c2:"#15803d", c3:"#c2410c",
    gold:"#d97706", silver:"#64748b", bronze:"#92400e",
    green:"#16a34a", blue:"#2563eb", red:"#dc2626", yellow:"#ca8a04",
    accent:"#2563eb",
    scrollTrack:"#e2eaf2", scrollThumb:"#94a3b8", scrollThumbHover:"#64748b",
  },
};
let C = { ...THEMES.dark };
const tc  = (t)  => ({ 4:C.t4,  5:C.t5,  6:C.t6  }[t]  || C.text);
const cc  = (cl) => ({ 1:C.c1,  2:C.c2,  3:C.c3  }[cl] || C.text);

// ─── HELPERS ─────────────────────────────────────────────────
const tokensSpent   = (bids) => Object.values(bids||{}).reduce((s,v)=>s+(v||0),0);
const validateRoll  = (r)    => /^20\d{2}PGP\w{3}$/i.test(r.trim());
const validateEmail = (e)    => /^[a-z0-9._%+-]+\.pgp\d{2}@iimshillong\.ac\.in$/i.test(e.trim());

function Tag({ children, color="#4da6ff", style={} }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", fontSize:11, fontWeight:600,
      color, background:`${color}18`, border:`1px solid ${color}40`,
      padding:"2px 8px", borderRadius:4, whiteSpace:"nowrap", ...style }}>
      {children}
    </span>
  );
}
function StarRow({ val=0, onChange, size=16 }) {
  const [hov,setHov]=useState(0);
  return (
    <span style={{ display:"inline-flex", gap:2, cursor:onChange?"pointer":"default" }}>
      {[1,2,3,4,5].map(n=>(
        <span key={n}
          onMouseEnter={()=>onChange&&setHov(n)}
          onMouseLeave={()=>onChange&&setHov(0)}
          onClick={()=>onChange&&onChange(n)}
          style={{ fontSize:size, lineHeight:1, userSelect:"none",
            color:(hov||val)>=n?C.gold:C.border, transition:"color .1s" }}>★</span>
      ))}
    </span>
  );
}

// ─── TIMER BANNER ─────────────────────────────────────────────
function AuctionTimerBanner() {
  const [msLeft,setMsLeft] = useState(msUntilNextRound());
  useEffect(()=>{ const iv=setInterval(()=>setMsLeft(msUntilNextRound()),1000); return ()=>clearInterval(iv); },[]);
  const pct = ((ROUND_MS-msLeft)/ROUND_MS)*100;
  const col = msLeft<600000?C.red:msLeft<1800000?C.yellow:C.green;
  const next = nextRoundStart();
  return (
    <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`,
      padding:"10px 24px", display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:36, height:36, borderRadius:9, background:`${col}18`,
          border:`1px solid ${col}40`, display:"flex", alignItems:"center",
          justifyContent:"center", fontSize:16 }}>⏱</div>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:C.textDim, letterSpacing:1 }}>ROUND RESETS IN</div>
          <div style={{ fontFamily:"monospace", fontSize:22, fontWeight:800,
            color:col, letterSpacing:3, lineHeight:1 }}>{fmtMs(msLeft)}</div>
        </div>
      </div>
      <div style={{ flex:1, minWidth:100 }}>
        <div style={{ height:5, background:C.border, borderRadius:3, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${pct}%`, background:col, borderRadius:3, transition:"width 1s linear" }}/>
        </div>
        <div style={{ fontSize:9, color:C.textDim, marginTop:3 }}>Current round progress</div>
      </div>
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <div style={{ fontSize:9, fontWeight:700, color:C.textDim, letterSpacing:1 }}>NEXT BIDDING ROUND STARTS AT</div>
        <div style={{ fontSize:14, fontWeight:700, color:C.accent }}>{fmtDateTime(next)}</div>
        <div style={{ fontSize:9, color:C.textDim }}>Rounds: 00:00 · 04:00 · 08:00 · 12:00 · 16:00 · 20:00 (UTC)</div>
      </div>
    </div>
  );
}

// ─── NEXT ROUND PILL ──────────────────────────────────────────
function NextRoundPill() {
  const [msLeft,setMsLeft]=useState(msUntilNextRound());
  useEffect(()=>{ const iv=setInterval(()=>setMsLeft(msUntilNextRound()),1000); return ()=>clearInterval(iv); },[]);
  return (
    <div style={{ display:"inline-flex", alignItems:"center", gap:8,
      padding:"6px 14px", background:`${C.accent}12`,
      border:`1px solid ${C.accent}40`, borderRadius:20, marginTop:8 }}>
      <span style={{ fontSize:13 }}>⏱</span>
      <span style={{ fontSize:12, color:C.textSub }}>Next round: </span>
      <span style={{ fontSize:12, fontWeight:700, color:C.accent, fontFamily:"monospace" }}>{fmtDateTime(nextRoundStart())}</span>
      <span style={{ fontSize:11, color:C.textDim }}>({fmtMs(msLeft)} away)</span>
    </div>
  );
}

// ─── NEXT ROUND PLACEHOLDER CARD ─────────────────────────────
function NextRoundPlaceholder() {
  const [msLeft,setMsLeft]=useState(msUntilNextRound());
  useEffect(()=>{ const iv=setInterval(()=>setMsLeft(msUntilNextRound()),1000); return ()=>clearInterval(iv); },[]);
  const col = msLeft<600000?C.red:msLeft<1800000?C.yellow:C.accent;
  return (
    <div style={{ padding:"16px 20px", background:`${col}0d`,
      border:`1px solid ${col}40`, borderRadius:12, marginBottom:20,
      display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
      <div style={{ fontSize:28 }}>🔔</div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:11, fontWeight:700, color:col, letterSpacing:.5 }}>NEXT BIDDING ROUND STARTS AT</div>
        <div style={{ fontSize:17, fontWeight:800, color:C.text, marginTop:2 }}>{fmtDateTime(nextRoundStart())}</div>
        <div style={{ fontSize:11, color:C.textSub, marginTop:2 }}>
          All bids reset every 2 hours · Windows: 00:00, 02:00, 04:00, 06:00, 08:00… (UTC)
        </div>
      </div>
      <div style={{ textAlign:"right" }}>
        <div style={{ fontFamily:"monospace", fontSize:28, fontWeight:800, color:col }}>{fmtMs(msLeft)}</div>
        <div style={{ fontSize:10, color:C.textDim }}>until reset</div>
      </div>
    </div>
  );
}

// ─── AUTH PAGE ────────────────────────────────────────────────
function AuthPage({ onAuth }) {
  const [mode,setMode]       = useState("login");
  const [form,setForm]       = useState({ name:"", roll:"", email:"" });
  const [err,setErr]         = useState("");
  const [loading,setLoading] = useState(false);
  const set_ = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleRegister = async () => {
    setErr("");
    if (!form.name.trim())       return setErr("Name is required");
    if (!validateRoll(form.roll))  return setErr("Roll must be 20xxPGPxxx — e.g. 2024PGP001");
    if (!validateEmail(form.email))return setErr("Email must be xxx.pgpxx@iimshillong.ac.in");
    setLoading(true);
    try {
      await signInAnonymously(auth);
      const rollKey = form.roll.toUpperCase().trim();
      const emailKey = form.email.trim().toLowerCase();
      // Check roll duplicate
      const snap = await get(ref(db,`students/${rollKey}`));
      if (snap.exists()) { setErr("This Registration Number is already registered."); setLoading(false); return; }
      // Check email duplicate across all students
      const allSnap = await get(ref(db,"students"));
      if (allSnap.exists()) {
        const existing = Object.values(allSnap.val());
        if (existing.some(s => s.email === emailKey)) {
          setErr("This email is already registered with another account."); setLoading(false); return;
        }
      }
      await set(ref(db,`students/${rollKey}`),{
        name:form.name.trim(), roll:rollKey,
        email:emailKey,
        createdAt:Date.now(), strategy:{}
      });
      // ── Write to dedicated names/ key-value store ──
      await set(ref(db,`names/${rollKey}`), form.name.trim());
      onAuth({ roll:rollKey, name:form.name.trim() });
    } catch(e) { setErr("Registration failed: "+e.message); }
    setLoading(false);
  };

  const handleLogin = async () => {
    setErr("");
    if (!form.roll.trim()) return setErr("Roll number required");
    setLoading(true);
    try {
      await signInAnonymously(auth);
      const rollKey = form.roll.toUpperCase().trim();
      const snap = await get(ref(db,`students/${rollKey}`));
      if (!snap.exists()) { setErr("Roll not found — please register first."); setLoading(false); return; }
      const studentName = snap.val().name || rollKey;
      // ── Backfill names/ key-value store on every login ──
      await set(ref(db,`names/${rollKey}`), studentName);
      onAuth({ roll:rollKey, name:studentName });
    } catch(e) { setErr("Login failed: "+e.message); }
    setLoading(false);
  };

  const inp = {
    width:"100%", padding:"12px 14px", background:C.bg,
    border:`1px solid ${C.border}`, borderRadius:8, color:C.text,
    fontSize:14, outline:"none", boxSizing:"border-box",
    fontFamily:"'Nunito',system-ui,sans-serif",
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex",
      alignItems:"center", justifyContent:"center", padding:20,
      fontFamily:"'Nunito',system-ui,sans-serif" }}>
      <style>{`
        .iims-auth-input::placeholder { color: ${C.textDim}; opacity: 1; }
      `}</style>
      <div style={{ position:"fixed", inset:0, backgroundImage:`radial-gradient(${C.border} 1px,transparent 1px)`,
        backgroundSize:"28px 28px", opacity:.4, pointerEvents:"none" }}/>
      <div style={{ width:"min(440px,100%)", position:"relative", zIndex:1 }}>
        <div style={{ textAlign:"center", marginBottom:40 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:14, marginBottom:12 }}>
            <img src={IIM_LOGO} alt="IIM Shillong" style={{ width:54, height:64, objectFit:"contain", flexShrink:0 }}/>
            <div>
              <div style={{ fontSize:22, fontWeight:800, color:C.text }}>Elective Bidding</div>
              <div style={{ fontSize:11, color:C.textSub }}>IIM Shillong · PGP Portal</div>
            </div>
          </div>
          <NextRoundPill/>
        </div>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`,
          borderRadius:16, padding:"32px 28px", boxShadow:"0 24px 60px rgba(0,0,0,.5)" }}>
          <div style={{ display:"flex", background:C.bg, borderRadius:8, padding:4, marginBottom:28 }}>
            {["login","register"].map(m=>(
              <button key={m} onClick={()=>{setMode(m);setErr("");}}
                style={{ flex:1, padding:"8px", borderRadius:6, border:"none", cursor:"pointer",
                  fontSize:13, fontWeight:600, fontFamily:"'Nunito',system-ui,sans-serif",
                  background:mode===m?C.surface:"transparent",
                  color:mode===m?C.text:C.textSub, transition:"all .2s" }}>
                {m==="login"?"Sign In":"Register"}
              </button>
            ))}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {mode==="register"&&(
              <>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:C.textSub, display:"block", marginBottom:6 }}>Full Name</label>
                  <input className="iims-auth-input" style={inp} value={form.name} onChange={e=>set_("name",e.target.value)} placeholder="Aarav Sharma"/>
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:C.textSub, display:"block", marginBottom:6 }}>Email</label>
                  <input className="iims-auth-input" style={inp} value={form.email} onChange={e=>set_("email",e.target.value)} placeholder="aarav.pgp26@iimshillong.ac.in"/>
                  <div style={{ fontSize:11, color:C.textDim, marginTop:4 }}>xxx.pgpxx@iimshillong.ac.in</div>
                </div>
              </>
            )}
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:C.textSub, display:"block", marginBottom:6 }}>Register Number</label>
              <input className="iims-auth-input" style={inp} value={form.roll} onChange={e=>set_("roll",e.target.value)}
                placeholder="2024PGP001"
                onKeyDown={e=>e.key==="Enter"&&(mode==="login"?handleLogin():handleRegister())}/>
              <div style={{ fontSize:11, color:C.textDim, marginTop:4 }}>Format: 20xxPGPxxx</div>
            </div>
            {err&&<div style={{ padding:"10px 14px", background:"rgba(239,68,68,.1)",
              border:"1px solid rgba(239,68,68,.3)", borderRadius:8, fontSize:13, color:C.red }}>{err}</div>}
            <button onClick={mode==="login"?handleLogin:handleRegister} disabled={loading}
              style={{ padding:"13px", background:loading?C.border:`linear-gradient(90deg,${C.t5},${C.c1})`,
                border:"none", borderRadius:8, color:"#fff", fontSize:14, fontWeight:700,
                cursor:loading?"not-allowed":"pointer", fontFamily:"'Nunito',system-ui,sans-serif" }}>
              {loading?"Please wait…":mode==="login"?"Sign In →":"Create Account →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────
export default function App() {
  const [theme,setTheme] = useState(()=>{
    try { return localStorage.getItem("iims_theme")||"dark"; } catch(_){ return "dark"; }
  });
  C = { ...THEMES[theme] };
  const toggleTheme = () => {
    const next = theme==="dark"?"light":"dark";
    setTheme(next);
    try { localStorage.setItem("iims_theme",next); } catch(_){}
  };
  const [user,setUser] = useState(()=>{
    try { const u=localStorage.getItem("iims_user"); return u?JSON.parse(u):null; } catch(_){ return null; }
  });
  const [activePage,setActivePage]         = useState("dashboard");
  const [allBids,setAllBids]               = useState({});
  const [allStudents,setAllStudents]       = useState({});
  const [rollToName,setRollToName]         = useState({});
  const [reviews,setReviews]               = useState([]);
  const [sidebarOpen,setSidebarOpen]       = useState(true);
  const [bidModal,setBidModal]             = useState(null);
  const [reviewModal,setReviewModal]       = useState(null);
  const [reviewDetailModal,setReviewDetailModal] = useState(null);
  const [strategyDraft,setStrategyDraft]   = useState({});
  const [enrolledIds,setEnrolledIds]       = useState(new Set()); // lifted from StrategyPage
  const [activeStratTerm,setActiveStratTerm]         = useState(4);
  const [activeStratCluster,setActiveStratCluster]   = useState(1);
  const [liveActivity,setLiveActivity]     = useState([]);
  const [onlineCount,setOnlineCount]       = useState(0);
  const [coursesVersion,setCoursesVersion] = useState(0); // bumped when COURSES updates
  const [bidStarted,setBidStarted]         = useState(false); // true after student clicks "Start"
  const handleAuth = (u) => {
    try { localStorage.setItem("iims_user", JSON.stringify(u)); } catch(_){}
    // Immediately seed the name map so leaderboard shows name right away
    setRollToName(prev => ({ ...prev, [u.roll.toUpperCase()]: u.name }));
    setUser(u);
  };
  const handleLogout = () => {
    try { localStorage.removeItem("iims_user"); } catch(_){}
    setStrategyDraft({});
    setEnrolledIds(new Set());
    setBidStarted(false);
    setAllBids({});
    setLiveActivity([]);
    setActivePage("dashboard");
    setUser(null);
  };
  const lastRoundRef = useRef(null);

  // ── Reviews + Students are global — load once on mount for all users ──
  useEffect(()=>{
    const revRef   = ref(db,"reviews");
    const studRef  = ref(db,"students");
    const namesRef = ref(db,"names");
    onValue(revRef,   snap=>setReviews(Object.values(snap.val()||{})));
    onValue(studRef, snap => {
      const students = snap.val() || {};
      setAllStudents(students);
      // Also merge into rollToName so leaderboard always has names from students/
      setRollToName(prev => {
        const merged = { ...prev };
        Object.entries(students).forEach(([roll, s]) => {
          if (s?.name) merged[roll.toUpperCase()] = s.name;
        });
        return merged;
      });
    });
    // ── names/ is a flat { roll: name } map — merge into rollToName (don't overwrite students merge) ──
    onValue(namesRef, snap=>{
      const data = snap.val()||{};
      setRollToName(prev => {
        const merged = { ...prev };
        Object.entries(data).forEach(([k,v])=>{ merged[k.toUpperCase()]=v; });
        return merged;
      });
    });
    // ── Backfill names/ from students/ for any existing users missing from names/ ──
    get(ref(db,"students")).then(snap=>{
      const students = snap.val()||{};
      const updates = {};
      Object.entries(students).forEach(([roll, s])=>{
        if (s?.name) updates[`names/${roll.toUpperCase()}`] = s.name.trim();
      });
      if (Object.keys(updates).length > 0) update(ref(db), updates).catch(()=>{});
    }).catch(()=>{});
    return ()=>{ off(revRef); off(studRef); off(namesRef); };
  },[]);

  useEffect(()=>{
    if (!user) return;
    // ── Reset per-user state so a new login never sees a previous user's data ──
    setStrategyDraft({});
    setEnrolledIds(new Set());
    setBidStarted(false);
    setActivePage("dashboard");
    // ── subjects/ table: always seed/sync from SUBJECTS_SEED ────────
    // If db is empty or any record is missing defaultBid, re-seed fully
    const subRef = ref(db, "subjects");
    get(subRef).then(async snap => {
      const existing = snap.val() || {};
      const needsReseed = !snap.exists()
        || Object.keys(existing).length < 80
        || !Object.values(existing)[0]?.defaultBid;
      if (needsReseed) await set(subRef, SUBJECTS_SEED);
    });
    onValue(subRef, snap => {
      const data = snap.val();
      if (data) {
        COURSES = Object.values(data).sort((a,b)=>a.term-b.term||a.cluster-b.cluster||a.id.localeCompare(b.id));
        setCoursesVersion(v => v+1);
      }
    });

    const bidsRef = ref(db,"bids");
    onValue(bidsRef, snap=>setAllBids(snap.val()||{}));
    const actRef  = ref(db,"activity");
    onValue(actRef,  snap=>{
      const arr=Object.values(snap.val()||{}).sort((a,b)=>b.ts-a.ts).slice(0,40);
      setLiveActivity(arr);
    });
    const presRef = ref(db,`presence/${user.roll}`);
    set(presRef,{online:true,name:user.name,roll:user.roll,ts:Date.now()});
    const onlRef  = ref(db,"presence");
    onValue(onlRef,  snap=>{
      const now=Date.now();
      const onlineUsers = Object.values(snap.val()||{}).filter(v=>v.online&&now-v.ts<70000);
      // Always count at least 1 (self) — presence propagates asynchronously
      setOnlineCount(Math.max(1, onlineUsers.length));
    });
    const hb = setInterval(()=>set(presRef,{online:true,name:user.name,roll:user.roll,ts:Date.now()}),20000);
    // Real-time listener on points/{roll} — single source of truth
    const ptsRef = ref(db,`points/${user.roll}`);
    onValue(ptsRef, snap => {
      const p = snap.val() || {};
      setStrategyDraft(p.strategyDraft || {});
      setEnrolledIds(new Set(p.enrolled || []));
      if (typeof p.bidStarted === 'boolean') setBidStarted(p.bidStarted);
    });

    // Round-reset watcher
    lastRoundRef.current = currentRoundStart();
    const resetCheck = setInterval(async ()=>{
      const nowRound = currentRoundStart();
      if (nowRound !== lastRoundRef.current) {
        lastRoundRef.current = nowRound;
        await set(ref(db,"bids"),{});
        push(ref(db,"activity"),{type:"reset",name:"System",ts:Date.now()});
      }
    },30000);

    return ()=>{
      clearInterval(hb); clearInterval(resetCheck);
      off(bidsRef); off(actRef); off(onlRef);
      off(ref(db,`points/${user.roll}`));
      off(subRef);
      set(presRef,{online:false,name:user.name,ts:Date.now()});
    };
  },[user]);

  const myBids = useMemo(()=>{
    const res={};
    Object.entries(allBids).forEach(([cid,bMap])=>{
      if (bMap&&bMap[user?.roll]) res[cid]=bMap[user.roll];
    });
    return res;
  },[allBids,user]);

  // Stable string key for enrolledIds Set — ensures useMemos recompute on add/remove
  const enrolledKey = useMemo(()=>[...enrolledIds].sort().join(','),[enrolledIds]);

  // Points remaining = 2300 minus sum of bid pts allocated in strategy (enrolled courses only)
  const strategyTotalPts = useMemo(()=>{
    return COURSES.filter(c=>enrolledIds.has(c.id))
      .reduce((s,c)=>s+(strategyDraft[c.id]||0),0);
  },[strategyDraft, enrolledKey]);
  const tokensLeft = TOTAL_TOKENS - strategyTotalPts;

  const placeBid = useCallback(async (courseId,amount)=>{
    if (!user) return;
    const course=COURSES.find(c=>c.id===courseId);
    await update(ref(db,`bids/${courseId}`),{[user.roll]:amount||null});
    if (amount>0) push(ref(db,"activity"),{
      type:"bid",roll:user.roll,name:user.name,
      courseId,courseTitle:course?.title,amount,ts:Date.now()
    });
  },[user,myBids,tokensLeft]);

  // ── savePoints: single-source-of-truth writer to points/{roll} ──
  const savePoints = useCallback(async (patch)=>{
    if (!user) return;
    await update(ref(db,`points/${user.roll}`), patch);
  },[user]);

  // Legacy alias used by StrategyPage
  const saveStrategy = useCallback(async (draft)=>{
    if (!user) return;
    await update(ref(db,`points/${user.roll}`),{strategyDraft:draft});
  },[user]);

  const submitReview = useCallback(async (review)=>{
    if (!user) return;
    await set(ref(db,`reviews/${user.roll}_${review.cid}`),
      {...review,roll:user.roll,ts:Date.now()});
  },[user]);

  const deleteReview = useCallback(async (cid)=>{
    if (!user) return;
    await set(ref(db,`reviews/${user.roll}_${cid}`), null);
  },[user]);

  if (!user) return <AuthPage onAuth={handleAuth}/>;

  const props = {
    user,activePage,setActivePage,allBids,myBids,tokensLeft,strategyTotalPts,allStudents,rollToName,reviews,bidStarted,setBidStarted,savePoints,coursesVersion,coursesVersion,
    placeBid,submitReview,deleteReview,bidModal,setBidModal,reviewModal,setReviewModal,
    reviewDetailModal,setReviewDetailModal,strategyDraft,setStrategyDraft,
    saveStrategy,enrolledIds,setEnrolledIds,activeStratTerm,setActiveStratTerm,activeStratCluster,setActiveStratCluster,
    liveActivity,onlineCount,sidebarOpen,setSidebarOpen,onLogout:handleLogout,theme,toggleTheme,
  };

  return <MainLayout {...props}/>;
}

// ─── MAIN LAYOUT ──────────────────────────────────────────────
function MainLayout(props) {
  const { activePage,setActivePage,sidebarOpen,setSidebarOpen,
          onLogout,onlineCount,tokensLeft,user,theme,toggleTheme } = props;
  useEffect(()=>{
    document.body.style.background = C.bg;
    document.body.style.color = C.text;
    const r = document.documentElement.style;
    r.setProperty("--scrollbar-track", C.scrollTrack||C.bg);
    r.setProperty("--scrollbar-thumb", C.scrollThumb||C.border);
    r.setProperty("--scrollbar-thumb-hover", C.scrollThumbHover||C.textDim);
  },[theme]);
  const nav=[
    {id:"dashboard",   icon:"⬡", label:"Dashboard"},
    {id:"courses",     icon:"📚",label:"Courses & Bids"},
    {id:"strategy",    icon:"🎯",label:"Bidding Strategy"},
    {id:"mybids",      icon:"🏆",label:"My Bid Results"},
    {id:"reviews",     icon:"⭐",label:"Reviews"},
    {id:"leaderboard", icon:"🏆",label:"Leaderboard"},
  ];
  const SW=sidebarOpen?220:68;
  return (
    <div style={{ display:"flex", minHeight:"100vh", background:C.bg,
      fontFamily:"'Nunito',system-ui,sans-serif", color:C.text }}>
      {/* Sidebar */}
      <div style={{ width:SW, flexShrink:0, background:C.surface,
        borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column",
        transition:"width .25s", overflow:"hidden", position:"sticky", top:0, height:"100vh" }}>
        <div style={{ padding:sidebarOpen?"18px 16px":"10px 8px",
          borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10 }}>
          <img src={IIM_LOGO} alt="IIM Shillong"
            style={{ width:sidebarOpen?36:32, height:sidebarOpen?42:38,
              objectFit:"contain", flexShrink:0, transition:"all .25s" }}/>
          {sidebarOpen&&<div style={{ overflow:"hidden" }}>
            <div style={{ fontSize:13,fontWeight:800,color:C.text,whiteSpace:"nowrap" }}>IIM Shillong</div>
            <div style={{ fontSize:10,color:C.textSub }}>Elective Portal</div>
          </div>}
        </div>
        <nav style={{ flex:1, padding:"12px 8px", display:"flex", flexDirection:"column", gap:2 }}>
          {nav.map(item=>(
            <button key={item.id} onClick={()=>setActivePage(item.id)}
              style={{ display:"flex",alignItems:"center",gap:10,
                padding:sidebarOpen?"10px 10px":"10px",
                borderRadius:8,border:"none",cursor:"pointer",
                fontSize:13,fontWeight:500,fontFamily:"'Nunito',system-ui,sans-serif",
                textAlign:"left",whiteSpace:"nowrap",
                background:activePage===item.id?`${C.accent}18`:"transparent",
                color:activePage===item.id?C.accent:C.textSub,
                borderLeft:activePage===item.id?`2px solid ${C.accent}`:"2px solid transparent",
                transition:"all .15s" }}>
              <span style={{ fontSize:16,flexShrink:0 }}>{item.icon}</span>
              {sidebarOpen&&<span>{item.label}</span>}
            </button>
          ))}
        </nav>
        <div style={{ padding:"12px 8px", borderTop:`1px solid ${C.border}` }}>
          {sidebarOpen&&(
            <div style={{ padding:"10px",background:C.bg,borderRadius:8,marginBottom:8 }}>
              <div style={{ fontSize:12,fontWeight:700,color:C.text,marginBottom:2 }}>{user.name}</div>
              <div style={{ fontSize:10,color:C.textSub,fontFamily:"monospace" }}>{user.roll}</div>
              <div style={{ marginTop:8,display:"flex",gap:6,alignItems:"center" }}>
                <div style={{ flex:1,height:4,background:C.border,borderRadius:2 }}>
                  <div style={{ height:"100%",width:`${(tokensLeft/TOTAL_TOKENS)*100}%`,
                    background:tokensLeft<1000?C.red:C.green,borderRadius:2,transition:"width .3s" }}/>
                </div>
                <span style={{ fontSize:10,color:C.textSub }}>{tokensLeft}</span>
              </div>
            </div>
          )}
          <button onClick={()=>setSidebarOpen(o=>!o)}
            style={{ width:"100%",padding:"8px",background:"transparent",
              border:`1px solid ${C.border}`,borderRadius:8,color:C.textSub,
              cursor:"pointer",fontSize:12,fontFamily:"'Nunito',system-ui,sans-serif" }}>
            {sidebarOpen?"◀ Collapse":"▶"}
          </button>
        </div>
      </div>

      {/* Right side */}
      <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column" }}>
        {/* Topbar */}
        <div style={{ height:52,background:C.surface,borderBottom:`1px solid ${C.border}`,
          display:"flex",alignItems:"center",padding:"0 24px",gap:14,
          position:"sticky",top:0,zIndex:100 }}>
          <div style={{ flex:1,fontSize:15,fontWeight:700,color:C.text }}>
            {nav.find(n=>n.id===activePage)?.label}
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:6 }}>
            <div style={{ width:7,height:7,borderRadius:"50%",background:C.green,
              boxShadow:`0 0 6px ${C.green}` }}/>
            <span style={{ fontSize:12,color:C.textSub }}>{onlineCount} online</span>
          </div>
          <Tag color={tokensLeft<200?C.red:tokensLeft<600?C.yellow:C.blue}>{tokensLeft} pts left</Tag>
          <button onClick={toggleTheme}
            title={theme==="dark"?"Switch to light mode":"Switch to dark mode"}
            style={{ padding:"6px 10px",background:"transparent",
              border:`1px solid ${C.border}`,borderRadius:6,
              color:C.textSub,cursor:"pointer",fontSize:15,lineHeight:1,
              display:"flex",alignItems:"center",justifyContent:"center" }}>
            {theme==="dark"?"☀️":"🌙"}
          </button>
          <button onClick={onLogout}
            style={{ padding:"6px 14px",background:"transparent",
              border:`1px solid ${C.border}`,borderRadius:6,
              color:C.textSub,cursor:"pointer",fontSize:12,fontFamily:"'Nunito',system-ui,sans-serif" }}>
            Sign out
          </button>
        </div>

        {/* Auction timer always visible */}
        <AuctionTimerBanner/>

        <div style={{ flex:1, overflow:"auto" }}>
          {activePage==="dashboard"   && <DashboardPage   {...props}/>}
          {activePage==="courses"     && <CoursesPage     {...props}/>}
          {activePage==="strategy"    && <StrategyPage    {...props}/>}
          {activePage==="reviews"     && <ReviewsPage     {...props}/>}
          {activePage==="mybids"      && <MyBidsPage       {...props}/>}
          {activePage==="leaderboard" && <LeaderboardPage {...props} coursesVersion={props.coursesVersion}/>}
        </div>
      </div>

      {props.bidModal&&(
        <BidModal course={props.bidModal} user={props.user}
          allBids={props.allBids} myBids={props.myBids}
          onBid={props.placeBid} onClose={()=>props.setBidModal(null)}
          tokensLeft={props.tokensLeft}/>
      )}
      {props.reviewModal&&(
        <WriteReviewModal course={props.reviewModal} user={props.user}
          reviews={props.reviews} onSave={props.submitReview}
          onClose={()=>props.setReviewModal(null)}/>
      )}
      {props.reviewDetailModal&&(
        <ReviewDetailModal course={props.reviewDetailModal}
          reviews={props.reviews} user={props.user}
          onWrite={()=>{ props.setReviewModal(props.reviewDetailModal); props.setReviewDetailModal(null); }}
          onDelete={props.deleteReview}
          onClose={()=>props.setReviewDetailModal(null)}/>
      )}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────
function DashboardPage({ user, myBids, allBids, tokensLeft, strategyTotalPts, reviews, liveActivity, strategyDraft, enrolledIds, setActivePage, setBidModal }) {

  const enrolledKey = useMemo(() => [...enrolledIds].sort().join(','), [enrolledIds]);

  // ── Credits from live bids (for the breakdown bars) ──────────
  const creditsByTerm = useMemo(() => {
    const t = {4:0,5:0,6:0};
    COURSES.forEach(c => { if (enrolledIds.has(c.id)) t[c.term] += c.credits; });
    return t;
  }, [enrolledKey]);

  const creditsByCluster = useMemo(() => {
    const t = {1:0,2:0,3:0};
    COURSES.forEach(c => { if (enrolledIds.has(c.id)) t[c.cluster] += c.credits; });
    return t;
  }, [enrolledKey]);

  // ── Strategy points per term ──────────────────────────────────
  const stratPtsByTerm = useMemo(() => {
    const t = {4:0,5:0,6:0};
    COURSES.filter(c => enrolledIds.has(c.id))
      .forEach(c => { t[c.term] += (strategyDraft[c.id]||0); });
    return t;
  }, [strategyDraft, enrolledKey]);

  const totalCr    = Object.values(creditsByTerm).reduce((s,v)=>s+v,0);
  const enrolled   = useMemo(() => COURSES.filter(c => enrolledIds.has(c.id)), [enrolledKey]);

  // ── Bid rows: one per ENROLLED course with strategy + live stats ─
  const bidRows = useMemo(() => {
    return enrolled.map(c => {
      const stratBid = strategyDraft[c.id] || 0;
      const allVals  = Object.values(allBids[c.id]||{}).filter(v=>v>0);
      const myLive   = myBids[c.id] || 0;
      const maxBid   = allVals.length ? Math.max(...allVals) : (stratBid||0);
      const minBid   = allVals.length ? Math.min(...allVals) : (stratBid||0);
      const avgBid   = allVals.length ? Math.round(allVals.reduce((s,v)=>s+v,0)/allVals.length) : (stratBid||0);
      const sorted   = [...allVals].sort((a,b)=>b-a);
      const rank     = myLive > 0 ? (sorted.indexOf(myLive)+1 || sorted.length+1) : null;
      const total    = allVals.length;
      const leading  = myLive > 0 && myLive >= maxBid && total > 0;
      return { course:c, stratBid, myLive, maxBid, minBid, avgBid, rank, total, leading };
    }).sort((a,b) => b.stratBid - a.stratBid);
  }, [enrolled, strategyDraft, allBids, myBids]);

  const stats = [
    {
      label:"Points Remaining",
      value: tokensLeft,
      sub: `${strategyTotalPts} of ${TOTAL_TOKENS} allocated in strategy`,
      color: tokensLeft < 200 ? C.red : tokensLeft < 600 ? C.yellow : C.blue,
    },
    {
      label:"Strategy Points",
      value: strategyTotalPts,
      sub: `T4:${stratPtsByTerm[4]} · T5:${stratPtsByTerm[5]} · T6:${stratPtsByTerm[6]}`,
      color: C.c1,
    },
    {
      label:"Total Credits",
      value: totalCr,
      sub: `${TOTAL_CR_MIN}–${TOTAL_CR_MAX} required`,
      color: totalCr>=TOTAL_CR_MIN&&totalCr<=TOTAL_CR_MAX ? C.green : C.yellow,
    },
    {
      label:"Subjects Added",
      value: enrolled.length,
      sub: `${bidRows.filter(r=>r.myLive>0).length} with live bids`,
      color: C.t4,
    },
  ];

  const termRows = [4,5,6].map(t => ({
    t, stratPts:stratPtsByTerm[t], termMax:t<6?800:700,
    cr:creditsByTerm[t], crMin:TERM_RULES[t].min, crMax:TERM_RULES[t].max,
    crOk:creditsByTerm[t]>=TERM_RULES[t].min && creditsByTerm[t]<=TERM_RULES[t].max,
  }));

  return (
    <div style={{ padding:"28px" }}>

      {/* Welcome */}
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:22,fontWeight:800,color:C.text,margin:0 }}>
          Welcome back, {user.name.split(" ")[0]} 👋
        </h2>
        <p style={{ color:C.textSub,margin:"5px 0 0",fontSize:13 }}>{user.roll}</p>
      </div>

      {/* Stat cards */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,marginBottom:24 }}>
        {stats.map(s=>(
          <div key={s.label} style={{ background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:12,padding:"20px",borderTop:`3px solid ${s.color}` }}>
            <div style={{ fontSize:32,fontWeight:800,color:s.color }}>{s.value}</div>
            <div style={{ fontSize:13,fontWeight:600,color:C.text,marginTop:4 }}>{s.label}</div>
            <div style={{ fontSize:11,color:C.textSub,marginTop:2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Strategy points per term + Go to Bidding Strategy */}
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:20,marginBottom:20 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10 }}>
          <div>
            <div style={{ fontSize:11,fontWeight:700,color:C.textSub,letterSpacing:.5 }}>STRATEGY POINTS ALLOCATION</div>
            <div style={{ fontSize:11,color:C.textDim,marginTop:3 }}>
              {TOTAL_TOKENS} total · <span style={{ color:C.blue }}>{strategyTotalPts} allocated</span> · <span style={{ color:tokensLeft<200?C.red:C.green }}>{tokensLeft} remaining</span>
            </div>
          </div>
          <button
            onClick={()=>setActivePage("strategy")}
            style={{ padding:"9px 20px",background:`linear-gradient(90deg,${C.blue},${C.c1})`,
              border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:700,
              cursor:"pointer",fontFamily:"'Nunito',system-ui,sans-serif",
              boxShadow:`0 0 20px ${C.blue}35`,transition:"opacity .2s" }}
            onMouseEnter={e=>e.currentTarget.style.opacity=".82"}
            onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            🎯 Go to Bidding Strategy →
          </button>
        </div>

        {/* Points remaining bar */}
        <div style={{ marginBottom:14 }}>
          <div style={{ height:8,background:C.border,borderRadius:4,overflow:"hidden" }}>
            <div style={{ height:"100%",
              width:`${Math.min(100,Math.round((strategyTotalPts/TOTAL_TOKENS)*100))}%`,
              background:`linear-gradient(90deg,${C.blue},${C.c1})`,
              borderRadius:4,transition:"width .4s" }}/>
          </div>
          <div style={{ display:"flex",justifyContent:"space-between",marginTop:5,fontSize:10,color:C.textDim }}>
            <span>0</span><span>{TOTAL_TOKENS}</span>
          </div>
        </div>

        {/* Per-term breakdown */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12 }}>
          {termRows.map(({t,stratPts,termMax,cr,crMin,crMax,crOk})=>{
            const pct  = Math.min(100,Math.round((stratPts/termMax)*100));
            const over = stratPts>termMax;
            return (
              <div key={t} style={{ padding:"14px",background:C.bg,
                border:`1px solid ${over?C.red+"50":C.border}`,borderRadius:10 }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:8 }}>
                  <span style={{ fontSize:13,fontWeight:800,color:tc(t) }}>Term {t}</span>
                  <span style={{ fontSize:10,color:over?C.red:C.textDim }}>max {termMax}</span>
                </div>
                <div style={{ height:6,background:C.border,borderRadius:3,overflow:"hidden",marginBottom:6 }}>
                  <div style={{ height:"100%",width:`${pct}%`,background:over?C.red:tc(t),borderRadius:3,transition:"width .4s" }}/>
                </div>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline" }}>
                  <span style={{ fontSize:22,fontWeight:800,color:over?C.red:tc(t),fontFamily:"monospace" }}>{stratPts}</span>
                  <span style={{ fontSize:10,color:crOk?C.green:C.yellow }}>{cr}cr / {crMin}–{crMax}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Enrolled subjects + bid stats table */}
      {bidRows.length > 0 ? (
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:20,overflow:"hidden" }}>
          <div style={{ padding:"14px 20px",borderBottom:`1px solid ${C.border}`,
            display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8 }}>
            <div>
              <div style={{ fontSize:11,fontWeight:700,color:C.textSub,letterSpacing:.5 }}>
                MY BIDDING STRATEGY — ENROLLED SUBJECTS ({bidRows.length})
              </div>
              <div style={{ fontSize:11,color:C.textDim,marginTop:2 }}>
                Strategy bid pts · live market min / avg / max · your live bid position
              </div>
            </div>
            <button onClick={()=>setActivePage("courses")}
              style={{ padding:"6px 14px",background:"transparent",border:`1px solid ${C.border}`,
                borderRadius:6,color:C.textSub,cursor:"pointer",fontSize:12,fontFamily:"'Nunito',system-ui,sans-serif" }}>
              Browse Courses →
            </button>
          </div>

          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse",minWidth:740 }}>
              <thead>
                <tr style={{ background:C.bg }}>
                  {[
                    {h:"Course"},
                    {h:"Tr"},
                    {h:"Cr"},
                    {h:"Strategy Pts", tip:"Points allocated in your strategy"},
                    {h:"Market Min",   tip:"Lowest live bid on this course"},
                    {h:"Market Avg",   tip:"Average live bid"},
                    {h:"Market Max",   tip:"Highest live bid"},
                    {h:"Live Bid",     tip:"Your actual submitted bid this round"},
                    {h:"Rank"},
                    {h:""},
                  ].map(({h,tip})=>(
                    <th key={h} title={tip}
                      style={{ padding:"9px 13px",textAlign:"left",fontSize:10,
                        fontWeight:700,color:C.textDim,letterSpacing:.5,whiteSpace:"nowrap",
                        borderBottom:`1px solid ${C.border}`,cursor:tip?"help":"default" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bidRows.map((row,i)=>{
                  const {course,stratBid,myLive,maxBid,minBid,avgBid,rank,total,leading} = row;
                  const hasLive = myLive > 0;
                  const span    = maxBid - minBid || 1;
                  const livePct = hasLive ? Math.max(0,Math.min(100,Math.round(((myLive-minBid)/span)*100))) : null;
                  const stratPct = Math.min(100,Math.round((stratBid/(course.term<6?800:700))*100));
                  const rowBg   = i%2===0 ? C.surface : C.bg;

                  return (
                    <tr key={course.id}
                      style={{ borderBottom:`1px solid ${C.borderDim}`,background:rowBg,transition:"background .1s" }}
                      onMouseEnter={e=>e.currentTarget.style.background=`${C.accent}0a`}
                      onMouseLeave={e=>e.currentTarget.style.background=rowBg}>

                      {/* Course name */}
                      <td style={{ padding:"11px 13px",maxWidth:210 }}>
                        <div style={{ fontSize:12,fontWeight:600,color:C.text,
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                          {course.title}
                        </div>
                        <div style={{ fontSize:10,color:C.textDim,marginTop:1,fontFamily:"monospace" }}>{course.id}</div>
                      </td>

                      {/* Term */}
                      <td style={{ padding:"11px 13px" }}>
                        <Tag color={tc(course.term)} style={{ fontSize:10 }}>T{course.term}</Tag>
                      </td>

                      {/* Credits */}
                      <td style={{ padding:"11px 13px",fontSize:12,color:C.textSub,textAlign:"center" }}>{course.credits}</td>

                      {/* Strategy pts — the planned bid */}
                      <td style={{ padding:"11px 13px" }}>
                        <div style={{ display:"inline-flex",alignItems:"baseline",gap:2,
                          background:`${C.c1}14`,border:`1px solid ${C.c1}38`,
                          borderRadius:6,padding:"3px 10px" }}>
                          <span style={{ fontSize:15,fontWeight:800,color:C.c1,fontFamily:"monospace" }}>
                            {stratBid||"—"}
                          </span>
                        </div>
                        {stratBid>0&&(
                          <div style={{ width:52,height:3,background:C.border,borderRadius:2,marginTop:4,overflow:"hidden" }}>
                            <div style={{ height:"100%",width:`${stratPct}%`,background:C.c1,borderRadius:2 }}/>
                          </div>
                        )}
                      </td>

                      {/* Min */}
                      <td style={{ padding:"11px 13px",fontSize:12,color:C.textSub,fontFamily:"monospace" }}>
                        {total>0 ? minBid : <span style={{ color:C.textDim }}>—</span>}
                      </td>

                      {/* Avg + bar */}
                      <td style={{ padding:"11px 13px" }}>
                        <div style={{ fontSize:12,color:C.textSub,fontFamily:"monospace",marginBottom:3 }}>
                          {total>0 ? avgBid : <span style={{ color:C.textDim }}>—</span>}
                        </div>
                        {total>0&&stratBid>0&&(
                          <div style={{ width:52,height:3,background:C.border,borderRadius:2,overflow:"hidden" }}>
                            <div style={{ height:"100%",
                              width:`${Math.max(0,Math.min(100,Math.round(((stratBid-minBid)/span)*100)))}%`,
                              background:stratBid>=avgBid?C.blue:C.yellow,borderRadius:2 }}/>
                          </div>
                        )}
                      </td>

                      {/* Max */}
                      <td style={{ padding:"11px 13px",fontSize:12,fontFamily:"monospace",
                        color:total>0?C.textSub:C.textDim }}>
                        {total>0 ? maxBid : "—"}
                      </td>

                      {/* Live bid (actual submitted this round) */}
                      <td style={{ padding:"11px 13px" }}>
                        {hasLive ? (
                          <span style={{ display:"inline-flex",alignItems:"baseline",gap:2,
                            background:`${leading?C.green:C.blue}14`,
                            border:`1px solid ${leading?C.green:C.blue}38`,
                            borderRadius:6,padding:"3px 9px" }}>
                            <span style={{ fontSize:14,fontWeight:800,
                              color:leading?C.green:C.blue,fontFamily:"monospace" }}>{myLive}</span>
                          </span>
                        ) : (
                          <span style={{ fontSize:11,color:C.textDim,fontStyle:"italic" }}>not bid</span>
                        )}
                      </td>

                      {/* Rank */}
                      <td style={{ padding:"11px 13px" }}>
                        {hasLive && rank!=null ? (
                          <span style={{ fontSize:12,fontWeight:700,
                            color:rank===1?C.gold:rank<=3?C.silver:C.textSub }}>
                            #{rank}<span style={{ fontSize:10,fontWeight:400,color:C.textDim }}>/{total}</span>
                          </span>
                        ) : <span style={{ color:C.textDim,fontSize:12 }}>—</span>}
                      </td>

                      {/* Update bid */}
                      <td style={{ padding:"11px 13px" }}>
                        <button onClick={()=>setBidModal(course)}
                          style={{ padding:"5px 11px",background:"transparent",
                            border:`1px solid ${C.border}`,borderRadius:6,
                            color:C.textSub,cursor:"pointer",fontSize:11,
                            fontFamily:"'Nunito',system-ui,sans-serif",whiteSpace:"nowrap",transition:"all .15s" }}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.blue;e.currentTarget.style.color=C.blue;}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textSub;}}>
                          {hasLive?"Update Bid":"Place Bid"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Empty state */
        <div style={{ background:C.surface,border:`1px dashed ${C.border}`,borderRadius:12,
          padding:"40px 24px",textAlign:"center",marginBottom:20 }}>
          <div style={{ fontSize:32,marginBottom:12 }}>🎯</div>
          <div style={{ fontSize:15,fontWeight:700,color:C.text,marginBottom:6 }}>No subjects in your strategy yet</div>
          <div style={{ fontSize:13,color:C.textSub,marginBottom:20 }}>
            Open Bidding Strategy, add subjects with <strong style={{color:C.green}}>+</strong>, and allocate your {TOTAL_TOKENS} points.
          </div>
          <button onClick={()=>setActivePage("strategy")}
            style={{ padding:"11px 24px",background:`linear-gradient(90deg,${C.blue},${C.c1})`,
              border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:700,
              cursor:"pointer",fontFamily:"'Nunito',system-ui,sans-serif" }}>
            🎯 Open Bidding Strategy
          </button>
        </div>
      )}

      {/* Term / Cluster credit breakdown */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20 }}>
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:18 }}>
          <div style={{ fontSize:11,fontWeight:700,color:C.textSub,marginBottom:12,letterSpacing:.5 }}>TERM CREDITS (ENROLLED)</div>
          {[4,5,6].map(t=>{
            const ok=(creditsByTerm[t]>=TERM_RULES[t].min&&creditsByTerm[t]<=TERM_RULES[t].max);
            return (
              <div key={t} style={{ marginBottom:10 }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                  <span style={{ fontSize:12,color:tc(t) }}>Term {t}</span>
                  <span style={{ fontSize:12,fontWeight:700,color:ok?C.green:C.yellow }}>
                    {creditsByTerm[t]}cr<span style={{ fontSize:10,color:C.textDim }}> / {TERM_RULES[t].min}–{TERM_RULES[t].max}</span>
                  </span>
                </div>
                <div style={{ height:5,background:C.border,borderRadius:3 }}>
                  <div style={{ height:"100%",width:`${Math.min(100,(creditsByTerm[t]/TERM_RULES[t].max)*100)}%`,
                    background:tc(t),borderRadius:3,transition:"width .4s" }}/>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:18 }}>
          <div style={{ fontSize:11,fontWeight:700,color:C.textSub,marginBottom:12,letterSpacing:.5 }}>CLUSTER CREDITS (ENROLLED)</div>
          {[1,2,3].map(cl=>{
            const ok=creditsByCluster[cl]>=CLUSTER_MIN[cl];
            return (
              <div key={cl} style={{ marginBottom:10 }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                  <span style={{ fontSize:12,color:cc(cl) }}>Cluster {cl}</span>
                  <span style={{ fontSize:12,fontWeight:700,color:ok?C.green:C.yellow }}>
                    {creditsByCluster[cl]}cr<span style={{ fontSize:10,color:C.textDim }}> / min {CLUSTER_MIN[cl]}</span>
                  </span>
                </div>
                <div style={{ height:5,background:C.border,borderRadius:3 }}>
                  <div style={{ height:"100%",width:`${Math.min(100,(creditsByCluster[cl]/20)*100)}%`,
                    background:cc(cl),borderRadius:3,transition:"width .4s" }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>


    </div>
  );
}
// ─── COURSES PAGE ─────────────────────────────────────────────
function CoursesPage({ allBids,myBids,tokensLeft,reviews,setBidModal,setReviewDetailModal }) {
  const [filterTerm,setFilterTerm]         = useState(0);
  const [filterCluster,setFilterCluster]   = useState(0);
  const [search,setSearch]                 = useState("");

  const filtered = useMemo(()=>COURSES.filter(c=>{
    if (filterTerm&&c.term!==filterTerm) return false;
    if (filterCluster&&c.cluster!==filterCluster) return false;
    if (search&&!c.title.toLowerCase().includes(search.toLowerCase())
        &&!c.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }),[filterTerm,filterCluster,search]);

  return (
    <div style={{ padding:"28px" }}>
      <div style={{ display:"flex",gap:10,marginBottom:20,flexWrap:"wrap" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search courses…"
          style={{ flex:1,minWidth:180,padding:"9px 14px",background:C.surface,
            border:`1px solid ${C.border}`,borderRadius:8,color:C.text,
            fontSize:13,outline:"none",fontFamily:"'Nunito',system-ui,sans-serif" }}/>
        <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
          {[0,4,5,6].map(t=>(
            <button key={t} onClick={()=>setFilterTerm(t)}
              style={{ padding:"8px 14px",borderRadius:8,
                border:`1px solid ${filterTerm===t?tc(t||4):C.border}`,
                background:filterTerm===t?`${tc(t||4)}18`:"transparent",
                color:filterTerm===t?tc(t||4):C.textSub,
                cursor:"pointer",fontSize:12,fontFamily:"'Nunito',system-ui,sans-serif" }}>
              {t===0?"All Terms":`T${t}`}
            </button>
          ))}
        </div>
        <div style={{ display:"flex",gap:6 }}>
          {[0,1,2,3].map(cl=>(
            <button key={cl} onClick={()=>setFilterCluster(cl)}
              style={{ padding:"8px 14px",borderRadius:8,
                border:`1px solid ${filterCluster===cl?cc(cl||1):C.border}`,
                background:filterCluster===cl?`${cc(cl||1)}18`:"transparent",
                color:filterCluster===cl?cc(cl||1):C.textSub,
                cursor:"pointer",fontSize:12,fontFamily:"'Nunito',system-ui,sans-serif" }}>
              {cl===0?"All Clusters":`C${cl}`}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))",gap:14 }}>
        {filtered.map(course=>{
          const bidMap=allBids[course.id]||{};
          const bidCount=Object.values(bidMap).filter(v=>v>0).length;
          const topBid=Math.max(0,...Object.values(bidMap));
          const myBid=myBids[course.id]||0;
          const {min,max}=bidLimits(course);
          const courseRevs=reviews.filter(r=>r.cid===course.id);
          const avgRating=courseRevs.length?(courseRevs.reduce((s,r)=>s+(r.sRating+r.pRating)/2,0)/courseRevs.length).toFixed(1):null;
          return (
            <div key={course.id} style={{ background:C.surface,
              border:`1px solid ${myBid>0?C.blue+"60":C.border}`,
              borderRadius:12,padding:16,transition:"border-color .2s" }}>
              <div style={{ height:2,borderRadius:"12px 12px 0 0",
                background:`linear-gradient(90deg,${tc(course.term)},${cc(course.cluster)})`,
                margin:"-16px -16px 14px" }}/>
              <div style={{ display:"flex",gap:6,marginBottom:8,flexWrap:"wrap" }}>
                <Tag color={tc(course.term)}>T{course.term}</Tag>
                <Tag color={cc(course.cluster)}>C{course.cluster}</Tag>
                <Tag color={C.textSub}>{course.credits}cr</Tag>
                <Tag color={C.accent} style={{ fontWeight:700 }}>
                  default {course.defaultBid ?? (course.credits>=4?100:50)} pts
                </Tag>
                {myBid>0&&<Tag color={C.blue}>Bid: {myBid}</Tag>}
              </div>
              <div style={{ fontSize:14,fontWeight:700,color:C.text,marginBottom:4,lineHeight:1.35 }}>{course.title}</div>
              <div style={{ fontSize:11,color:"#79c0ff",marginBottom:4 }}>{course.prof}</div>
              {course.prereq&&(
                <div style={{ fontSize:10,color:C.yellow,marginBottom:6,
                  background:"rgba(234,179,8,.07)",border:"1px solid rgba(234,179,8,.2)",
                  borderRadius:5,padding:"3px 7px",lineHeight:1.4 }}>
                  📋 Prereq: {course.prereq}
                </div>
              )}
              <div style={{ display:"flex",gap:14,marginBottom:12,fontSize:12,color:C.textSub }}>
                <span>📚 {course.sections} section{course.sections>1?"s":""}</span>
                <span>👥 {bidCount} bids</span>
                <span>🏆 {topBid||"—"}</span>
                {avgRating&&<span>⭐ {avgRating}</span>}
              </div>
              <div style={{ display:"flex",gap:8 }}>
                <button onClick={()=>setBidModal(course)}
                  style={{ flex:1,padding:"8px",
                    background:myBid>0?`${C.blue}22`:"#238636",
                    border:`1px solid ${myBid>0?C.blue:"#2ea043"}`,
                    borderRadius:6,color:myBid>0?C.blue:"#fff",
                    cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"'Nunito',system-ui,sans-serif" }}>
                  {myBid>0?`Update (${myBid})`:"Place Bid"}
                </button>
                <button onClick={()=>setReviewDetailModal(course)}
                  style={{ padding:"8px 12px",background:"transparent",
                    border:`1px solid ${C.border}`,borderRadius:6,
                    color:C.textSub,cursor:"pointer",fontSize:12,fontFamily:"'Nunito',system-ui,sans-serif" }}>
                  {courseRevs.length} ★
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── STRATEGY PAGE ────────────────────────────────────────────
// ─── STRATEGY PAGE ────────────────────────────────────────────
// Term → Cluster → Subject navigation with drag-to-reorder and slider allocation
// "Added" subjects are explicitly enrolled; only they count for credit/pts validation.
function StrategyPage({ user, myBids, allBids, strategyDraft, setStrategyDraft, saveStrategy, enrolledIds, setEnrolledIds, bidStarted, setBidStarted, savePoints }) {
  const [activeTerm,    setActiveTerm]    = useState(4);
  const [activeCluster, setActiveCluster] = useState(1);
  const [view,          setView]          = useState("edit"); // "edit" | "summary"

  // Slider guard — drag is disabled while any slider/input is focused
  const [isSliding, setIsSliding] = useState(false);
  const [dragId,    setDragId]    = useState(null);
  const [dragOver,  setDragOver]  = useState(null);

  // enrolledIds and setEnrolledIds are now lifted to App-level props

  // Per-cell ordering keyed "t{term}c{cluster}"
  const cellKey = (t, c) => `t${t}c${c}`;
  const [orderedCourses, setOrderedCourses] = useState(() => {
    const init = {};
    [4,5,6].forEach(t => [1,2,3].forEach(cl => {
      init[cellKey(t,cl)] = COURSES.filter(c => c.term===t && c.cluster===cl).map(c => c.id);
    }));
    return init;
  });

  // Saved strategies
  const [savedStrategies, setSavedStrategies] = useState([]);
  const [saveNameInput,   setSaveNameInput]   = useState("");
  const [showSaveInput,   setShowSaveInput]   = useState(false);
  const [savedFlash,      setSavedFlash]      = useState("");

  const key            = cellKey(activeTerm, activeCluster);
  const ids            = orderedCourses[key] || [];
  const allCellCourses = ids.map(id => COURSES.find(c => c.id===id)).filter(Boolean);
  const enrolledInCell = allCellCourses.filter(c => enrolledIds.has(c.id));
  const notEnrolledInCell = allCellCourses.filter(c => !enrolledIds.has(c.id));

  // Max bid points per term
  const termMax = (t) => t < 6 ? 800 : 700;

  // ── Enroll / remove ──────────────────────────────────────────
  const toggleEnroll = (courseId, enroll) => {
    const next = new Set(enrolledIds);
    let draftUpdate = { ...localDraft };
    if (enroll) {
      next.add(courseId);
      if (!localDraft[courseId]) {
        const course = COURSES.find(c => c.id === courseId);
        const defBid = course?.defaultBid ?? (course?.credits >= 4 ? 100 : 50);
        draftUpdate[courseId] = defBid;
        setLocalDraft(draftUpdate);
        setStrategyDraft(draftUpdate);
      }
    } else {
      next.delete(courseId);
      draftUpdate[courseId] = 0;
      setLocalDraft(draftUpdate);
      setStrategyDraft(draftUpdate);
    }
    setEnrolledIds(next);
    setHasUnsaved(true);
  };

  // Load enrolled from Firebase on mount
  useEffect(() => {
    get(ref(db, `students/${user.roll}/savedStrategies`)).then(snap => {
      if (snap.val()) setSavedStrategies(Object.values(snap.val()).sort((a,b)=>a.savedAt-b.savedAt));
    }).catch(()=>{});
  }, [user.roll]);

  // ── Bid draft helpers ─────────────────────────────────────────
  // Local-only draft — doesn't write to Firebase until "Update Strategy" is clicked
  const [localDraft, setLocalDraft] = useState({...strategyDraft});
  const [hasUnsaved, setHasUnsaved] = useState(false);

  // Keep localDraft in sync when strategyDraft changes from Firebase (e.g. after load)
  useEffect(() => { setLocalDraft({...strategyDraft}); setHasUnsaved(false); }, [strategyDraft]);

  const setBidDraft = (courseId, amount) => {
    const updated = { ...localDraft, [courseId]: amount };
    setLocalDraft(updated);
    setStrategyDraft(updated); // sync App-level immediately so Dashboard/MyBids update live
    setHasUnsaved(true);
  };

  const handleUpdateStrategy = async () => {
    const draft    = { ...localDraft };
    const enrolled = [...enrolledIds];
    // 1. Update App-level state immediately
    setStrategyDraft(draft);
    // 2. Save to Firebase — enrolled + draft atomically
    try {
      await update(ref(db, `points/${user.roll}`), {
        strategyDraft: draft,
        enrolled,
      });
    } catch(_) {}
    // 3. If bidding is already started, re-submit live bids for ALL enrolled courses
    if (bidStarted) {
      try {
        // First, remove bids for any courses that were un-enrolled
        const allCourseIds = COURSES.map(c => c.id);
        const removals = allCourseIds
          .filter(id => !enrolledIds.has(id))
          .map(id => update(ref(db, `bids/${id}`), { [user.roll]: null }));
        // Then upsert bids for all currently enrolled courses
        const enrolledCrs = COURSES.filter(c => enrolledIds.has(c.id));
        const writes = enrolledCrs.map(c => {
          const amount = draft[c.id] || c.defaultBid || (c.credits >= 4 ? 100 : 50);
          return update(ref(db, `bids/${c.id}`), { [user.roll]: amount });
        });
        await Promise.all([...removals, ...writes]);
        // Log activity
        enrolledCrs.forEach(c => {
          const amount = draft[c.id] || c.defaultBid || (c.credits >= 4 ? 100 : 50);
          push(ref(db, "activity"), {
            type:"bid", roll:user.roll, name:user.name,
            courseId:c.id, courseTitle:c.title, amount, ts:Date.now()
          });
        });
      } catch(_) {}
    }
    setHasUnsaved(false);
    setSavedFlash(bidStarted ? "✅ Strategy & live bids updated!" : "✅ Strategy saved!");
    setTimeout(() => setSavedFlash(""), 3000);
  };

  // ── Drag handlers — blocked while sliding ────────────────────
  const handleDragStart = (e, id) => {
    if (isSliding) { e.preventDefault(); return; }
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== dragId) setDragOver(id);
  };
  const handleDrop = (e, targetId) => {
    e.preventDefault();
    setDragOver(null);
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const list = [...ids];
    const fi = list.indexOf(dragId), ti = list.indexOf(targetId);
    if (fi < 0 || ti < 0) { setDragId(null); return; }
    list.splice(fi, 1); list.splice(ti, 0, dragId);
    setOrderedCourses(o => ({ ...o, [key]: list }));
    setDragId(null);
  };
  const handleDragEnd = () => { setDragId(null); setDragOver(null); };

  // ── Save As ───────────────────────────────────────────────────
  const handleSaveAs = async () => {
    const name = saveNameInput.trim() || `Strategy ${savedStrategies.length + 1}`;
    const snap = { name, draft: { ...strategyDraft }, enrolled: [...enrolledIds], savedAt: Date.now() };
    setSavedStrategies(s => [...s, snap]);
    setSaveNameInput(""); setShowSaveInput(false);
    setSavedFlash(`"${name}" saved!`);
    setTimeout(() => setSavedFlash(""), 3000);
    try { await set(ref(db, `students/${user.roll}/savedStrategies/${snap.savedAt}`), snap); } catch(_) {}
  };

  const loadStrategy = async (snap) => {
    const newDraft    = snap.draft || {};
    const newEnrolled = snap.enrolled ? [...snap.enrolled] : [];
    setStrategyDraft(newDraft);
    setLocalDraft(newDraft);
    setHasUnsaved(false);
    if (snap.enrolled) setEnrolledIds(new Set(snap.enrolled));
    try {
      await update(ref(db, `points/${user.roll}`), {
        strategyDraft: newDraft,
        enrolled: newEnrolled,
        bidStarted: false,
      });
    } catch(_) {}
    setSavedFlash(`Loaded "${snap.name}"`);
    setTimeout(() => setSavedFlash(""), 3000);
    setView("edit");
  };

  // ── Aggregations — ONLY over enrolled courses ─────────────────
  const enrolledCourses = COURSES.filter(c => enrolledIds.has(c.id));

  // pts spent per term (only enrolled, only those with a bid)
  const termPtsSpent = useMemo(() => {
    const t = {4:0,5:0,6:0};
    enrolledCourses.forEach(c => { t[c.term] += (localDraft[c.id]||0); });
    return t;
  }, [enrolledCourses, localDraft]);

  // credits per term (only enrolled)
  const creditsByTerm = useMemo(() => {
    const t = {4:0,5:0,6:0};
    enrolledCourses.forEach(c => { t[c.term] += c.credits; });
    return t;
  }, [enrolledCourses]);

  // credits per cluster (only enrolled)
  const creditsByCluster = useMemo(() => {
    const t = {1:0,2:0,3:0};
    enrolledCourses.forEach(c => { t[c.cluster] += c.credits; });
    return t;
  }, [enrolledCourses]);

  // pts per cluster per term (only enrolled)
  const clusterPtsMap = useMemo(() => {
    const res = {};
    [4,5,6].forEach(term => [1,2,3].forEach(cl => {
      const crs = enrolledCourses.filter(c => c.term===term && c.cluster===cl);
      res[`${term}_${cl}`] = {
        pts:    crs.reduce((s,c) => s+(strategyDraft[c.id]||0), 0),
        cr:     crs.reduce((s,c) => s+c.credits, 0),
        courses: crs,
      };
    }));
    return res;
  }, [enrolledCourses, strategyDraft]);

  const totalPts   = Object.values(termPtsSpent).reduce((s,v)=>s+v,0);
  const totalCr    = Object.values(creditsByTerm).reduce((s,v)=>s+v,0);

  // Cluster pts within current term must not exceed termMax
  const clusterPtsInView = (clusterPtsMap[`${activeTerm}_${activeCluster}`]?.pts) || 0;
  const termPtsInView    = termPtsSpent[activeTerm] || 0;
  const termMaxInView    = termMax(activeTerm);

  // ── Issues — only enrolled count ─────────────────────────────
  const issues = useMemo(() => {
    const res = [];
    // Total credit
    if (enrolledCourses.length > 0) {
      if (totalCr < TOTAL_CR_MIN || totalCr > TOTAL_CR_MAX)
        res.push(`Total ${totalCr}cr — need ${TOTAL_CR_MIN}–${TOTAL_CR_MAX}cr`);
      [4,5,6].forEach(t => {
        const cr = creditsByTerm[t];
        if (cr < TERM_RULES[t].min || cr > TERM_RULES[t].max)
          res.push(`Term ${t}: ${cr}cr (need ${TERM_RULES[t].min}–${TERM_RULES[t].max})`);
      });
      [1,2,3].forEach(c => {
        if (creditsByCluster[c] < CLUSTER_MIN[c])
          res.push(`Cluster ${c}: ${creditsByCluster[c]}cr (min ${CLUSTER_MIN[c]})`);
      });
      // pts within term budget
      [4,5,6].forEach(t => {
        const pts = termPtsSpent[t];
        const max = termMax(t);
        if (pts > max) res.push(`Term ${t} bid pts ${pts} exceeds ${max} limit`);
      });
      // cluster pts must not exceed term max
      [4,5,6].forEach(t => [1,2,3].forEach(cl => {
        const { pts } = clusterPtsMap[`${t}_${cl}`] || {pts:0};
        if (pts > termMax(t)) res.push(`T${t} C${cl} pts ${pts} > term max ${termMax(t)}`);
      }));
    }
    return res;
  }, [enrolledCourses, totalCr, creditsByTerm, creditsByCluster, termPtsSpent, clusterPtsMap]);

  // ─────────────────────────────────────────────────────────────
  // SUMMARY VIEW
  // ─────────────────────────────────────────────────────────────
  if (view === "summary") {
    return (
      <div style={{ padding:"28px" }}>
        <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:24,flexWrap:"wrap" }}>
          <button onClick={()=>setView("edit")}
            style={{ padding:"8px 14px",background:"transparent",border:`1px solid ${C.border}`,
              borderRadius:8,color:C.textSub,cursor:"pointer",fontSize:13,fontFamily:"'Nunito',system-ui,sans-serif" }}>
            ← Back to Editor
          </button>
          <h2 style={{ fontSize:20,fontWeight:800,margin:0 }}>Strategy Summary</h2>
          <div style={{ marginLeft:"auto",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap" }}>
            <Tag color={C.blue}>{totalPts} pts · {enrolledCourses.length} subjects · {totalCr}cr</Tag>
            {showSaveInput ? (
              <div style={{ display:"flex",gap:6,alignItems:"center" }}>
                <input autoFocus value={saveNameInput} onChange={e=>setSaveNameInput(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleSaveAs()}
                  placeholder="Strategy name…"
                  style={{ padding:"7px 12px",background:C.bg,border:`1px solid ${C.blue}`,
                    borderRadius:8,color:C.text,fontSize:13,outline:"none",fontFamily:"'Nunito',system-ui,sans-serif",width:150 }}/>
                <button onClick={handleSaveAs}
                  style={{ padding:"7px 14px",background:C.blue,border:"none",borderRadius:8,
                    color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'Nunito',system-ui,sans-serif" }}>Save</button>
                <button onClick={()=>{setShowSaveInput(false);setSaveNameInput("");}}
                  style={{ padding:"7px 10px",background:"transparent",border:`1px solid ${C.border}`,
                    borderRadius:8,color:C.textSub,cursor:"pointer",fontSize:13,fontFamily:"'Nunito',system-ui,sans-serif" }}>✕</button>
              </div>
            ) : (
              <button onClick={()=>setShowSaveInput(true)}
                style={{ padding:"8px 16px",background:C.blue,border:"none",borderRadius:8,
                  color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'Nunito',system-ui,sans-serif" }}>
                💾 Save As…
              </button>
            )}
          </div>
        </div>

        {savedFlash&&(
          <div style={{ padding:"10px 14px",background:"rgba(34,197,94,.12)",border:"1px solid rgba(34,197,94,.4)",
            borderRadius:8,fontSize:12,color:C.green,marginBottom:14 }}>{savedFlash}</div>
        )}

        {/* Validation */}
        {issues.length>0 ? (
          <div style={{ padding:"12px 16px",background:"rgba(234,179,8,.08)",border:"1px solid rgba(234,179,8,.3)",borderRadius:10,marginBottom:20 }}>
            <div style={{ fontSize:12,fontWeight:700,color:C.yellow,marginBottom:6 }}>⚠ Strategy Issues</div>
            {issues.map((iss,i)=><div key={i} style={{ fontSize:12,color:C.yellow,opacity:.85 }}>• {iss}</div>)}
          </div>
        ) : enrolledCourses.length>0 ? (
          <div style={{ padding:"12px 16px",background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.3)",borderRadius:10,marginBottom:20 }}>
            <div style={{ fontSize:12,fontWeight:700,color:C.green }}>✓ Strategy valid — all credit and point rules satisfied</div>
          </div>
        ) : (
          <div style={{ padding:"12px 16px",background:`${C.border}40`,borderRadius:10,marginBottom:20 }}>
            <div style={{ fontSize:12,color:C.textDim }}>No subjects added yet. Go back to the editor and click + to add subjects.</div>
          </div>
        )}

        {/* Term → Cluster → Subject tree */}
        {[4,5,6].map(term => {
          const tPts    = termPtsSpent[term];
          const tMax    = termMax(term);
          const tCr     = creditsByTerm[term];
          const tValid  = tCr >= TERM_RULES[term].min && tCr <= TERM_RULES[term].max;
          const tOver   = tPts > tMax;
          // any enrolled in this term?
          const hasAny  = enrolledCourses.some(c=>c.term===term);
          return (
            <div key={term} style={{ background:C.surface,border:`1px solid ${tOver?C.red+"50":C.border}`,borderRadius:12,marginBottom:16,overflow:"hidden" }}>
              {/* Term header */}
              <div style={{ padding:"14px 20px",background:`${tc(term)}0c`,borderBottom:`1px solid ${C.border}`,
                display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
                <div style={{ width:7,height:7,borderRadius:"50%",background:tc(term),flexShrink:0 }}/>
                <span style={{ fontSize:15,fontWeight:800,color:tc(term) }}>Term {term}</span>
                <span style={{ fontSize:11,color:C.textDim }}>max {tMax} pts · {TERM_RULES[term].min}–{TERM_RULES[term].max}cr</span>
                {!hasAny&&<span style={{ fontSize:11,color:C.textDim,fontStyle:"italic" }}>— no subjects added</span>}
                <div style={{ marginLeft:"auto",display:"flex",gap:8,alignItems:"center" }}>
                  <Tag color={tValid?C.green:C.yellow}>{tCr}cr</Tag>
                  <Tag color={tOver?C.red:tc(term)}>{tPts}/{tMax} pts {tOver?"⚠":""}</Tag>
                  <div style={{ width:80,height:6,background:C.border,borderRadius:3,overflow:"hidden" }}>
                    <div style={{ height:"100%",width:`${Math.min(100,(tPts/tMax)*100)}%`,background:tOver?C.red:tc(term),borderRadius:3 }}/>
                  </div>
                </div>
              </div>

              {/* Clusters */}
              {[1,2,3].map(cl => {
                const ck    = `${term}_${cl}`;
                const info  = clusterPtsMap[ck] || {pts:0,cr:0,courses:[]};
                const cOver = info.pts > tMax;
                if (!info.courses.length) return (
                  <div key={cl} style={{ padding:"10px 20px 10px 32px",borderBottom:`1px solid ${C.borderDim}`,
                    display:"flex",gap:8,alignItems:"center" }}>
                    <Tag color={cc(cl)} style={{ fontSize:10 }}>Cluster {cl}</Tag>
                    <span style={{ fontSize:12,color:C.textDim }}>No subjects added</span>
                  </div>
                );
                return (
                  <div key={cl} style={{ borderBottom:`1px solid ${C.borderDim}` }}>
                    <div style={{ padding:"10px 20px 10px 28px",background:`${cc(cl)}08`,
                      display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                      <span style={{ fontSize:12,fontWeight:700,color:cc(cl) }}>Cluster {cl}</span>
                      <Tag color={cc(cl)} style={{ fontSize:10 }}>{info.cr}cr</Tag>
                      <Tag color={cOver?C.red:cc(cl)} style={{ fontSize:10 }}>{info.pts} pts {cOver?"⚠ exceeds term max":""}</Tag>
                      <div style={{ width:60,height:4,background:C.border,borderRadius:2,overflow:"hidden" }}>
                        <div style={{ height:"100%",width:`${Math.min(100,(info.pts/tMax)*100)}%`,background:cOver?C.red:cc(cl),borderRadius:2 }}/>
                      </div>
                    </div>
                    {info.courses.map((course, idx) => {
                      const pts       = strategyDraft[course.id]||0;
                      const pct       = Math.round((pts/tMax)*100);
                      const actualBid = myBids[course.id]||0;
                      const topBid    = Math.max(0,...Object.values(allBids[course.id]||{}));
                      const isLeading = actualBid>0 && actualBid>=topBid && topBid>0;
                      return (
                        <div key={course.id}
                          style={{ padding:"10px 20px 10px 44px",display:"flex",alignItems:"center",gap:12,
                            borderTop:`1px solid ${C.borderDim}`,background:idx%2===0?"transparent":`${C.card}80` }}>
                          <span style={{ fontSize:11,color:C.textDim,width:16,flexShrink:0 }}>#{idx+1}</span>
                          <div style={{ flex:1,minWidth:0 }}>
                            <div style={{ fontSize:13,fontWeight:600,color:C.text,marginBottom:2,
                              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{course.title}</div>
                            <div style={{ display:"flex",gap:6,flexWrap:"wrap",alignItems:"center" }}>
                              <span style={{ fontSize:11,color:C.textDim }}>{course.credits}cr</span>
                              {actualBid>0&&(
                                <Tag color={isLeading?C.green:C.yellow} style={{ fontSize:10 }}>
                                  Live {actualBid}{isLeading?" ✓ Leading":""}
                                </Tag>
                              )}
                            </div>
                          </div>
                          <div style={{ width:110,flexShrink:0 }}>
                            <div style={{ height:5,background:C.border,borderRadius:3,overflow:"hidden",marginBottom:3 }}>
                              <div style={{ height:"100%",width:`${pct}%`,background:cc(cl),borderRadius:3 }}/>
                            </div>
                            <div style={{ fontSize:10,color:C.textDim,textAlign:"right" }}>{pct}% of {tMax}</div>
                          </div>
                          <div style={{ fontFamily:"monospace",fontSize:15,fontWeight:800,
                            color:cc(cl),width:52,textAlign:"right",flexShrink:0 }}>{pts}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Saved strategies */}
        {savedStrategies.length>0&&(
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:20,marginTop:8 }}>
            <div style={{ fontSize:12,fontWeight:700,color:C.textSub,letterSpacing:.5,marginBottom:12 }}>SAVED STRATEGIES</div>
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              {savedStrategies.map((s,i)=>(
                <div key={i} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                  background:C.bg,border:`1px solid ${C.border}`,borderRadius:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13,fontWeight:600,color:C.text }}>{s.name}</div>
                    <div style={{ fontSize:11,color:C.textDim }}>{new Date(s.savedAt).toLocaleString("en-IN")}</div>
                  </div>
                  <button onClick={()=>loadStrategy(s)}
                    style={{ padding:"6px 12px",background:"transparent",border:`1px solid ${C.blue}60`,
                      borderRadius:6,color:C.blue,cursor:"pointer",fontSize:12,fontFamily:"'Nunito',system-ui,sans-serif" }}>
                    Load
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // EDIT VIEW
  // ─────────────────────────────────────────────────────────────
  const termOver     = termPtsInView > termMaxInView;
  const termCrOver   = creditsByTerm[activeTerm] > TERM_RULES[activeTerm].max;
  const termCrUnder  = enrolledCourses.filter(c=>c.term===activeTerm).length > 0
                       && creditsByTerm[activeTerm] < TERM_RULES[activeTerm].min;

  // Cluster pts must not exceed term max
  const clusterOver  = clusterPtsInView > termMaxInView;

  // ── Start bidding: write bidStarted=true to points/ + submit all strategy bids ──
  const handleStart = async () => {
    if (enrolledCourses.length === 0) {
      setSavedFlash("⚠ Add at least one subject first");
      setTimeout(() => setSavedFlash(""), 3000);
      return;
    }
    // ── Hard validation: credit rules ──
    const creditErrors = [];
    [4, 5, 6].forEach(t => {
      const cr  = creditsByTerm[t] || 0;
      const min = TERM_RULES[t].min;
      const max = TERM_RULES[t].max;
      if (cr < min || cr > max)
        creditErrors.push(`Term ${t}: ${cr}cr — need ${min}–${max}cr`);
    });
    if (creditErrors.length > 0) {
      setSavedFlash("⚠ " + creditErrors[0]);
      setTimeout(() => setSavedFlash(""), 4000);
      return;
    }
    // ── Hard validation: bid point limits per term ──
    const ptErrors = [];
    [4, 5].forEach(t => {
      const pts = termPtsSpent[t] || 0;
      if (pts >= 800) ptErrors.push(`Term ${t} bid points ${pts} must be < 800`);
    });
    const pts6 = termPtsSpent[6] || 0;
    if (pts6 >= 700) ptErrors.push(`Term 6 bid points ${pts6} must be < 700`);
    if (ptErrors.length > 0) {
      setSavedFlash("⚠ " + ptErrors[0]);
      setTimeout(() => setSavedFlash(""), 4000);
      return;
    }
    try {
      // Mark started in points/
      await update(ref(db, `points/${user.roll}`), { bidStarted: true });
      setBidStarted(true);
      // Submit each enrolled course bid — use defaultBid as fallback
      const freshEnrolled = COURSES.filter(c => enrolledIds.has(c.id));
      const writes = freshEnrolled.map(c => {
        const amount = strategyDraft[c.id] || c.defaultBid || (c.credits >= 4 ? 100 : 50);
        return update(ref(db, `bids/${c.id}`), { [user.roll]: amount });
      });
      await Promise.all(writes);
      // Log activity for each bid
      freshEnrolled.forEach(c => {
        const amount = strategyDraft[c.id] || c.defaultBid || (c.credits >= 4 ? 100 : 50);
        push(ref(db, "activity"), {
          type:"bid", roll:user.roll, name:user.name,
          courseId:c.id, courseTitle:c.title, amount, ts:Date.now()
        });
      });
      setSavedFlash(`🚀 ${freshEnrolled.length} bids submitted!`);
      setTimeout(() => setSavedFlash(""), 5000);
    } catch(e) {
      setSavedFlash("Error starting: " + e.message);
      setTimeout(() => setSavedFlash(""), 4000);
    }
  };

  // ── Cancel: reset all strategy points and enrolled subjects ──
  const handleCancel = async () => {
    try {
      // Wipe all live bids for enrolled courses (use fresh COURSES)
      const freshEnrolled = COURSES.filter(c => enrolledIds.has(c.id));
      const removes = freshEnrolled.map(c =>
        update(ref(db, `bids/${c.id}`), { [user.roll]: null })
      );
      await Promise.all(removes);
      // Reset points/ record
      await set(ref(db, `points/${user.roll}`), {
        strategyDraft: {},
        enrolled: [],
        bidStarted: false,
      });
      // Reset local state
      setStrategyDraft({});
      setLocalDraft({});
      setEnrolledIds(new Set());
      setBidStarted(false);
      setHasUnsaved(false);
      setSavedFlash("Strategy cancelled and reset.");
      setTimeout(() => setSavedFlash(""), 3000);
    } catch(e) {
      setSavedFlash("Error cancelling strategy");
      setTimeout(() => setSavedFlash(""), 3000);
    }
  };

  return (
    <div style={{ padding:"28px" }}>

      {/* ── Header ── */}
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,gap:12,flexWrap:"wrap" }}>
        <div>
          <h2 style={{ fontSize:20,fontWeight:800,margin:"0 0 4px" }}>Bidding Strategy Planner</h2>
          <p style={{ color:C.textSub,margin:0,fontSize:13 }}>
            Add subjects with <strong style={{color:C.green}}>+</strong>, remove with <strong style={{color:C.red}}>✕</strong> · Drag to reprioritize
          </p>
        </div>
        <div style={{ display:"flex",gap:8,alignItems:"center",flexWrap:"wrap" }}>
          {savedFlash&&(
            <div style={{ padding:"6px 12px",background:"rgba(34,197,94,.12)",border:"1px solid rgba(34,197,94,.4)",
              borderRadius:8,fontSize:12,color:C.green }}>{savedFlash}</div>
          )}
          <button onClick={()=>setView("summary")}
            style={{ padding:"8px 14px",background:"transparent",border:`1px solid ${C.border}`,
              borderRadius:8,color:C.textSub,cursor:"pointer",fontSize:13,fontFamily:"'Nunito',system-ui,sans-serif" }}>
            📊 Summary
          </button>
          {/* Update Strategy button — always visible, pulses when unsaved */}
          <button onClick={handleUpdateStrategy}
            style={{ padding:"8px 18px",
              background: hasUnsaved
                ? `linear-gradient(90deg,${C.blue},${C.c1})`
                : `${C.surface}`,
              border: hasUnsaved ? "none" : `1px solid ${C.border}`,
              borderRadius:8, color: hasUnsaved ? "#fff" : C.textSub,
              cursor:"pointer", fontSize:13, fontWeight:700,
              fontFamily:"'Nunito',system-ui,sans-serif",
              boxShadow: hasUnsaved ? `0 0 16px ${C.blue}40` : "none",
              animation: hasUnsaved ? "pulse 1.5s infinite" : "none",
              transition:"all .2s" }}>
            {hasUnsaved ? "💾 Update Strategy ●" : "💾 Update Strategy"}
          </button>
          {showSaveInput ? (
            <div style={{ display:"flex",gap:6,alignItems:"center" }}>
              <input autoFocus value={saveNameInput} onChange={e=>setSaveNameInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleSaveAs()}
                placeholder="Strategy name…"
                style={{ padding:"7px 12px",background:C.bg,border:`1px solid ${C.blue}`,
                  borderRadius:8,color:C.text,fontSize:13,outline:"none",fontFamily:"'Nunito',system-ui,sans-serif",width:150 }}/>
              <button onClick={handleSaveAs}
                style={{ padding:"7px 12px",background:C.blue,border:"none",borderRadius:8,
                  color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'Nunito',system-ui,sans-serif" }}>Save</button>
              <button onClick={()=>{setShowSaveInput(false);setSaveNameInput("");}}
                style={{ padding:"7px 10px",background:"transparent",border:`1px solid ${C.border}`,
                  borderRadius:8,color:C.textSub,cursor:"pointer",fontSize:13,fontFamily:"'Nunito',system-ui,sans-serif" }}>✕</button>
            </div>
          ) : (
            <button onClick={()=>setShowSaveInput(true)}
              style={{ padding:"8px 14px",background:"transparent",border:`1px solid ${C.border}60`,
                borderRadius:8,color:C.textSub,cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'Nunito',system-ui,sans-serif" }}>
              💾 Save As
            </button>
          )}
        </div>
      </div>

      {/* ── START / CANCEL banner ── */}
      <div style={{ display:"flex",gap:12,alignItems:"center",padding:"14px 18px",
        marginBottom:16,borderRadius:10,flexWrap:"wrap",
        background: bidStarted ? "rgba(34,197,94,.07)" : "rgba(59,130,246,.07)",
        border: `1px solid ${bidStarted ? C.green+"40" : C.blue+"40"}` }}>
        <div style={{ flex:1,minWidth:200 }}>
          {bidStarted ? (
            <>
              <div style={{ fontSize:13,fontWeight:700,color:C.green }}>🟢 Strategy Active — Bids Submitted</div>
              <div style={{ fontSize:11,color:C.textSub,marginTop:3 }}>
                Your strategy bids are live. Cancel to reset everything and start fresh.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize:13,fontWeight:700,color:C.text }}>Strategy not started yet</div>
              <div style={{ fontSize:11,color:C.textSub,marginTop:3 }}>
                Plan your subjects &amp; allocate points, then click <strong style={{color:C.green}}>Start Bidding</strong> to submit all bids at once.
              </div>
            </>
          )}
        </div>
        <div style={{ display:"flex",gap:8,flexShrink:0 }}>
          {/* Cancel — always visible */}
          <button onClick={handleCancel}
            style={{ padding:"9px 18px",borderRadius:8,
              background:"rgba(239,68,68,.1)",border:`1px solid rgba(239,68,68,.4)`,
              color:C.red,cursor:"pointer",fontSize:13,fontWeight:700,
              fontFamily:"'Nunito',system-ui,sans-serif",transition:"all .15s" }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(239,68,68,.22)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(239,68,68,.1)"}>
            ✕ Cancel &amp; Reset
          </button>
          {/* Start — disabled after started or if issues */}
          <button onClick={handleStart}
            disabled={bidStarted || enrolledCourses.length===0}
            title={bidStarted?"Already started — cancel to restart":enrolledCourses.length===0?"Add subjects first":"Submit all strategy bids as live bids"}
            style={{ padding:"9px 22px",borderRadius:8,border:"none",
              background: bidStarted || enrolledCourses.length===0
                ? C.border
                : `linear-gradient(90deg,${C.green},#16a34a)`,
              color: bidStarted || enrolledCourses.length===0
                ? C.textDim : "#fff",
              cursor: bidStarted || enrolledCourses.length===0
                ? "not-allowed" : "pointer",
              fontSize:13,fontWeight:700,fontFamily:"'Nunito',system-ui,sans-serif",
              boxShadow: bidStarted || enrolledCourses.length===0 ? "none" : `0 0 20px ${C.green}50`,
              transition:"all .15s" }}>
            {bidStarted ? "✓ Started" : "▶ Start Bidding"}
          </button>
        </div>
      </div>

      {/* ── Validation banner ── */}
      {issues.length>0 ? (
        <div style={{ padding:"10px 16px",background:"rgba(234,179,8,.08)",border:"1px solid rgba(234,179,8,.3)",
          borderRadius:8,marginBottom:16 }}>
          <div style={{ fontSize:12,fontWeight:700,color:C.yellow,marginBottom:4 }}>
            ⚠ Advisory — you can still start bidding:
          </div>
          {issues.map((iss,i)=>(
            <div key={i} style={{ fontSize:12,color:C.yellow,opacity:.85 }}>• {iss}</div>
          ))}
        </div>
      ) : enrolledCourses.length>0 ? (
        <div style={{ padding:"10px 16px",background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.3)",
          borderRadius:8,marginBottom:16 }}>
          <span style={{ fontSize:12,fontWeight:700,color:C.green }}>✓ Strategy valid — ready to start bidding</span>
        </div>
      ) : (
        <div style={{ padding:"10px 16px",background:"rgba(59,130,246,.06)",border:"1px solid rgba(59,130,246,.25)",
          borderRadius:8,marginBottom:16 }}>
          <span style={{ fontSize:12,color:C.textSub }}>Add subjects using the <strong style={{color:C.green}}>+</strong> button below to begin</span>
        </div>
      )}

      {/* ── Term tabs ── */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:10,fontWeight:700,color:C.textDim,letterSpacing:1,marginBottom:8 }}>TERM</div>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
          {[4,5,6].map(t => {
            const tPts  = termPtsSpent[t]||0;
            const tMax  = termMax(t);
            const tCr   = creditsByTerm[t]||0;
            const over  = tPts>tMax || tCr>TERM_RULES[t].max;
            const active = activeTerm===t;
            return (
              <button key={t} onClick={()=>{ setActiveTerm(t); setActiveCluster(1); }}
                style={{ padding:"10px 18px",borderRadius:10,
                  border:`2px solid ${active?tc(t):over?"rgba(239,68,68,.5)":C.border}`,
                  background:active?`${tc(t)}18`:"transparent",
                  color:active?tc(t):over?C.red:C.textSub,
                  cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"'Nunito',system-ui,sans-serif",transition:"all .15s" }}>
                <div>Term {t}</div>
                <div style={{ fontSize:10,fontWeight:400,marginTop:2,color:active?tc(t):over?C.red:C.textDim }}>
                  {tPts}/{tMax} pts · {tCr}cr {over?"⚠":""}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Cluster tabs ── */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:10,fontWeight:700,color:C.textDim,letterSpacing:1,marginBottom:8 }}>CLUSTER</div>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
          {[1,2,3].map(cl => {
            const ck    = `${activeTerm}_${cl}`;
            const info  = clusterPtsMap[ck]||{pts:0,cr:0,courses:[]};
            const cOver = info.pts > termMax(activeTerm);
            const active = activeCluster===cl;
            return (
              <button key={cl} onClick={()=>setActiveCluster(cl)}
                style={{ padding:"10px 18px",borderRadius:10,
                  border:`2px solid ${active?cc(cl):cOver?"rgba(239,68,68,.5)":C.border}`,
                  background:active?`${cc(cl)}18`:"transparent",
                  color:active?cc(cl):cOver?C.red:C.textSub,
                  cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"'Nunito',system-ui,sans-serif",transition:"all .15s" }}>
                <div>Cluster {cl}</div>
                <div style={{ fontSize:10,fontWeight:400,marginTop:2,color:active?cc(cl):cOver?C.red:C.textDim }}>
                  {info.pts} pts · {info.courses.length} subjects {cOver?"⚠":""}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Budget bars ── */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16 }}>
        {/* Term pts budget */}
        <div style={{ padding:"12px 14px",background:C.surface,
          border:`1px solid ${termOver?C.red+"60":C.border}`,borderRadius:10 }}>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
            <span style={{ fontSize:11,fontWeight:700,color:tc(activeTerm) }}>Term {activeTerm} Bid Points</span>
            <span style={{ fontSize:11,fontWeight:700,color:termOver?C.red:C.text }}>
              {termPtsInView}/{termMaxInView} {termOver?"⚠ OVER":""}
            </span>
          </div>
          <div style={{ height:5,background:C.border,borderRadius:3,overflow:"hidden" }}>
            <div style={{ height:"100%",width:`${Math.min(100,(termPtsInView/termMaxInView)*100)}%`,
              background:termOver?C.red:tc(activeTerm),borderRadius:3,transition:"width .3s" }}/>
          </div>
        </div>
        {/* Term credits */}
        <div style={{ padding:"12px 14px",background:C.surface,
          border:`1px solid ${(termCrOver||termCrUnder)?C.yellow+"60":C.border}`,borderRadius:10 }}>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
            <span style={{ fontSize:11,fontWeight:700,color:tc(activeTerm) }}>Term {activeTerm} Credits</span>
            <span style={{ fontSize:11,fontWeight:700,color:(termCrOver||termCrUnder)?C.yellow:C.text }}>
              {creditsByTerm[activeTerm]}cr / {TERM_RULES[activeTerm].min}–{TERM_RULES[activeTerm].max}
              {termCrOver?" ⚠ OVER":termCrUnder?" ⚠ UNDER":""}
            </span>
          </div>
          <div style={{ height:5,background:C.border,borderRadius:3,overflow:"hidden" }}>
            <div style={{ height:"100%",
              width:`${Math.min(100,(creditsByTerm[activeTerm]||0)/TERM_RULES[activeTerm].max*100)}%`,
              background:(termCrOver||termCrUnder)?C.yellow:C.green,borderRadius:3,transition:"width .3s" }}/>
          </div>
        </div>
      </div>

      {/* ── Enrolled subjects (draggable) ── */}
      {enrolledInCell.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:10,fontWeight:700,color:C.green,letterSpacing:1,marginBottom:8,display:"flex",alignItems:"center",gap:8 }}>
            <span>✓ ADDED SUBJECTS ({enrolledInCell.length})</span>
            {clusterOver&&<span style={{ color:C.red,fontWeight:700 }}>⚠ Cluster pts {clusterPtsInView} exceeds term max {termMaxInView}</span>}
          </div>
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            {enrolledInCell.map((course, idx) => {
              const stratBid    = localDraft[course.id]||0;
              const pct         = Math.round((stratBid/termMaxInView)*100);
              const actualBid   = myBids[course.id]||0;
              const topBid      = Math.max(0,...Object.values(allBids[course.id]||{}));
              const isLeading   = actualBid>0 && actualBid>=topBid && topBid>0;
              const isDragging  = dragId===course.id;
              const isDropOver  = dragOver===course.id;
              // Would removing this course help credit constraints?
              const wouldHelp   = termCrOver;

              return (
                <div key={course.id}
                  draggable={!isSliding}
                  onDragStart={e=>handleDragStart(e,course.id)}
                  onDragOver={e=>handleDragOver(e,course.id)}
                  onDrop={e=>handleDrop(e,course.id)}
                  onDragEnd={handleDragEnd}
                  style={{ display:"flex",gap:10,alignItems:"center",padding:"13px 14px",
                    background:isDragging?`${C.accent}10`:isDropOver?`${C.accent}18`:C.surface,
                    border:`1px solid ${isDragging?C.accent:isDropOver?C.accent+"80":C.green+"40"}`,
                    borderRadius:10,cursor:isSliding?"default":"grab",
                    transition:"all .15s",opacity:isDragging?.45:1,userSelect:"none" }}>

                  {/* Drag handle + priority */}
                  <div style={{ display:"flex",alignItems:"center",gap:6,flexShrink:0 }}>
                    <div style={{ display:"flex",flexDirection:"column",gap:2,opacity:.35 }}>
                      {[0,1,2].map(i=><div key={i} style={{ width:14,height:2,background:C.textSub,borderRadius:1 }}/>)}
                    </div>
                    <div style={{ width:22,height:22,borderRadius:6,background:C.bg,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:10,fontWeight:700,color:C.textSub }}>
                      {idx+1}
                    </div>
                  </div>

                  {/* Course info */}
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:13,fontWeight:700,color:C.text,marginBottom:3,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{course.title}</div>
                    <div style={{ display:"flex",gap:5,flexWrap:"wrap",alignItems:"center" }}>
                      <Tag color={cc(activeCluster)} style={{ fontSize:10 }}>{course.credits}cr</Tag>
                      <Tag color={C.textDim} style={{ fontSize:10 }}>
                        default {course.defaultBid ?? (course.credits>=4?100:50)}pts
                      </Tag>
                      {actualBid>0&&(
                        <Tag color={isLeading?C.green:C.yellow} style={{ fontSize:10 }}>
                          Live {actualBid}{isLeading?" ✓":""}
                        </Tag>
                      )}
                      {Object.values(allBids[course.id]||{}).filter(v=>v>0).length>0&&(
                        <span style={{ fontSize:10,color:C.textDim }}>
                          {Object.values(allBids[course.id]||{}).filter(v=>v>0).length} bidders
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bid allocation */}
                  <div style={{ display:"flex",gap:8,alignItems:"center",flexShrink:0,minWidth:240 }}>
                    <div style={{ width:30,textAlign:"right",fontSize:10,color:C.textDim,flexShrink:0 }}>{pct}%</div>
                    <div style={{ flex:1 }}>
                      <input type="range" min={0} max={termMaxInView} step={10} value={stratBid}
                        onMouseDown={()=>setIsSliding(true)}
                        onTouchStart={()=>setIsSliding(true)}
                        onMouseUp={()=>setIsSliding(false)}
                        onTouchEnd={()=>setIsSliding(false)}
                        onChange={e=>setBidDraft(course.id,Number(e.target.value))}
                        style={{ width:"100%",cursor:"pointer",accentColor:cc(activeCluster),
                          WebkitAppearance:"none",appearance:"none",height:4,borderRadius:2,outline:"none",
                          background:`linear-gradient(to right,${cc(activeCluster)} ${pct}%,${C.border} ${pct}%)` }}/>
                    </div>
                    <input type="number" min={0} max={termMaxInView} step={10} value={stratBid||""}
                      onChange={e=>setBidDraft(course.id,Math.min(termMaxInView,Math.max(0,Number(e.target.value)||0)))}
                      onFocus={()=>setIsSliding(true)}
                      onBlur={()=>setIsSliding(false)}
                      placeholder="0"
                      style={{ width:58,padding:"5px 6px",background:C.bg,
                        border:`1px solid ${stratBid>0?cc(activeCluster):C.border}`,
                        borderRadius:6,color:C.text,fontSize:13,fontWeight:700,
                        textAlign:"center",outline:"none",fontFamily:"monospace",cursor:"text" }}/>
                    {/* Remove (✕) button */}
                    <button
                      onClick={()=>toggleEnroll(course.id,false)}
                      title="Remove from strategy"
                      style={{ width:28,height:28,borderRadius:7,flexShrink:0,
                        background:"rgba(239,68,68,.08)",border:`1px solid rgba(239,68,68,.35)`,
                        color:C.red,cursor:"pointer",fontSize:14,fontWeight:700,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        transition:"all .15s" }}
                      onMouseEnter={e=>{e.currentTarget.style.background="rgba(239,68,68,.2)";}}
                      onMouseLeave={e=>{e.currentTarget.style.background="rgba(239,68,68,.08)";}}>
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Not-enrolled subjects (add pool) ── */}
      <div>
        <div style={{ fontSize:10,fontWeight:700,color:C.textDim,letterSpacing:1,marginBottom:8 }}>
          AVAILABLE TO ADD ({notEnrolledInCell.length})
        </div>
        {notEnrolledInCell.length===0&&enrolledInCell.length>0&&(
          <div style={{ padding:"14px",textAlign:"center",color:C.textDim,fontSize:12,
            background:C.surface,border:`1px dashed ${C.border}`,borderRadius:8 }}>
            All subjects in this cluster have been added.
          </div>
        )}
        {notEnrolledInCell.length===0&&enrolledInCell.length===0&&(
          <div style={{ padding:"14px",textAlign:"center",color:C.textDim,fontSize:12,
            background:C.surface,border:`1px dashed ${C.border}`,borderRadius:8 }}>
            No courses in Term {activeTerm} · Cluster {activeCluster}
          </div>
        )}
        <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
          {notEnrolledInCell.map(course => {
            const actualBid = myBids[course.id]||0;
            const bidders   = Object.values(allBids[course.id]||{}).filter(v=>v>0).length;
            const topBid    = Math.max(0,...Object.values(allBids[course.id]||{}));
            // credit limit warning
            const newCr     = creditsByTerm[activeTerm] + course.credits;
            const wouldExceed = newCr > TERM_RULES[activeTerm].max;
            return (
              <div key={course.id}
                style={{ display:"flex",alignItems:"center",gap:10,padding:"11px 14px",
                  background:C.surface,
                  border:`1px solid ${wouldExceed?C.red+"30":C.border}`,
                  borderRadius:9,opacity:.75,transition:"opacity .15s" }}
                onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                onMouseLeave={e=>e.currentTarget.style.opacity=".75"}>
                {/* Course info */}
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:13,fontWeight:600,color:C.textSub,marginBottom:3,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{course.title}</div>
                  <div style={{ display:"flex",gap:5,flexWrap:"wrap",alignItems:"center" }}>
                    <Tag color={C.textDim} style={{ fontSize:10 }}>{course.credits}cr</Tag>
                    {bidders>0&&<span style={{ fontSize:10,color:C.textDim }}>{bidders} bidders · top {topBid}</span>}
                    {wouldExceed&&(
                      <Tag color={C.red} style={{ fontSize:10 }}>
                        ⚠ Would exceed {TERM_RULES[activeTerm].max}cr term limit
                      </Tag>
                    )}
                    {actualBid>0&&<Tag color={C.blue} style={{ fontSize:10 }}>Live bid: {actualBid}</Tag>}
                  </div>
                </div>
                {/* Add (+) button */}
                <button
                  onClick={()=>toggleEnroll(course.id,true)}
                  title="Add to strategy"
                  style={{ width:30,height:30,borderRadius:8,flexShrink:0,
                    background:"rgba(34,197,94,.1)",border:`1px solid rgba(34,197,94,.4)`,
                    color:C.green,cursor:"pointer",fontSize:18,fontWeight:700,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    transition:"all .15s",lineHeight:1 }}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(34,197,94,.25)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(34,197,94,.1)";}}>
                  +
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ─── REVIEWS PAGE ─────────────────────────────────────────────
function ReviewsPage({ reviews,user,setReviewModal,setReviewDetailModal }) {
  const [search,setSearch]         = useState("");
  const [filterTerm,setFilterTerm] = useState(0);
  const reviewed = reviews.filter(r=>r.roll===user.roll).map(r=>r.cid);
  const courseStats = useMemo(()=>{
    return COURSES.map(c=>{
      const cr=reviews.filter(r=>r.cid===c.id);
      const avg=cr.length?(cr.reduce((s,r)=>s+(r.sRating+r.pRating)/2,0)/cr.length).toFixed(1):null;
      return {...c,reviewCount:cr.length,avgRating:avg};
    }).filter(c=>{
      if(filterTerm&&c.term!==filterTerm) return false;
      if(search&&!c.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a,b)=>(b.avgRating||0)-(a.avgRating||0));
  },[reviews,filterTerm,search]);

  return (
    <div style={{ padding:"28px" }}>
      <div style={{ display:"flex",gap:10,marginBottom:20,flexWrap:"wrap" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
          style={{ flex:1,minWidth:160,padding:"9px 14px",background:C.surface,
            border:`1px solid ${C.border}`,borderRadius:8,color:C.text,
            fontSize:13,outline:"none",fontFamily:"'Nunito',system-ui,sans-serif" }}/>
        <div style={{ display:"flex",gap:6 }}>
          {[0,4,5,6].map(t=>(
            <button key={t} onClick={()=>setFilterTerm(t)}
              style={{ padding:"8px 14px",borderRadius:8,
                border:`1px solid ${filterTerm===t?tc(t||4):C.border}`,
                background:filterTerm===t?`${tc(t||4)}18`:"transparent",
                color:filterTerm===t?tc(t||4):C.textSub,
                cursor:"pointer",fontSize:12,fontFamily:"'Nunito',system-ui,sans-serif" }}>
              {t===0?"All":`T${t}`}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12 }}>
        {courseStats.map(course=>{
          const hasReviewed=reviewed.includes(course.id);
          return (
            <div key={course.id} onClick={()=>setReviewDetailModal(course)}
              style={{ background:C.surface,border:`1px solid ${hasReviewed?C.green+"40":C.border}`,
                borderRadius:10,padding:14,cursor:"pointer",transition:"border-color .2s" }}>
              <div style={{ display:"flex",gap:6,marginBottom:8 }}>
                <Tag color={tc(course.term)}>T{course.term}</Tag>
                <Tag color={cc(course.cluster)}>C{course.cluster}</Tag>
                {hasReviewed&&<Tag color={C.green}>✓</Tag>}
              </div>
              <div style={{ fontSize:13,fontWeight:700,color:C.text,marginBottom:6,lineHeight:1.3 }}>{course.title}</div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                {course.avgRating
                  ? <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <StarRow val={Math.round(course.avgRating)} size={13}/>
                      <span style={{ fontSize:13,fontWeight:700,color:C.gold }}>{course.avgRating}</span>
                      <span style={{ fontSize:11,color:C.textDim }}>({course.reviewCount})</span>
                    </div>
                  : <span style={{ fontSize:12,color:C.textDim }}>No reviews yet</span>
                }
                <button onClick={e=>{ e.stopPropagation(); setReviewModal(course); }}
                  style={{ padding:"5px 10px",
                    background:hasReviewed?"transparent":"#238636",
                    border:`1px solid ${hasReviewed?C.border:"#2ea043"}`,
                    borderRadius:6,color:hasReviewed?C.textSub:"#fff",
                    cursor:"pointer",fontSize:11,fontFamily:"'Nunito',system-ui,sans-serif" }}>
                  {hasReviewed?"Edit":"Review"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MY BID RESULTS PAGE ─────────────────────────────────────
// Shows subjects where user has a live bid, grouped by term.
// "Won" = user is in the top N bidders (N = course sections).
// Reference: top 50 bidders per subject are considered.
function MyBidsPage({ user, allBids, allStudents, myBids, coursesVersion, strategyDraft, enrolledIds }) {
  const AVN = "'Nunito',system-ui,sans-serif";
  const [filterTerm, setFilterTerm] = useState(0);

  const enrolledKey = useMemo(() => [...enrolledIds].sort().join(','), [enrolledIds]);

  const results = useMemo(() => {
    const relevantIds = new Set([
      ...Object.keys(myBids).filter(id => myBids[id] > 0),
      ...enrolledIds,
    ]);
    return COURSES
      .filter(c => {
        if (filterTerm && c.term !== filterTerm) return false;
        return relevantIds.has(c.id);
      })
      .map(c => {
        const myAmt = myBids[c.id] || strategyDraft?.[c.id] || 0;
        const isLive = (myBids[c.id] || 0) > 0;
        const allVals = Object.entries(allBids[c.id] || {})
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 60);
        const rank = isLive ? allVals.findIndex(([roll]) => roll === user.roll) + 1 : 0;
        const total = allVals.length;
        const topBid = allVals[0]?.[1] || myAmt;
        const avgBid = total ? Math.round(allVals.reduce((s, [, v]) => s + v, 0) / total) : myAmt;
        const won = rank > 0 && rank <= c.sections;
        return { course: c, myAmt, rank, total, topBid, avgBid, won, isLive };
      })
      .sort((a, b) => {
        if (a.won && !b.won) return -1;
        if (!a.won && b.won) return 1;
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        return (a.rank || 999) - (b.rank || 999);
      });
  }, [myBids, allBids, filterTerm, coursesVersion, enrolledKey, strategyDraft]);

  const wonCount   = results.filter(r => r.won).length;
  const liveCount  = results.filter(r => r.isLive).length;
  const planCount  = results.filter(r => !r.isLive).length;
  const totalCr    = results.filter(r => r.won).reduce((s, r) => s + r.course.credits, 0);

  const termGroups = [4, 5, 6].map(t => ({
    t,
    won:  results.filter(r => r.won  && r.course.term === t),
    lost: results.filter(r => !r.won && r.course.term === t && (myBids[r.course.id]||0) > 0),
  })).filter(g => g.won.length + g.lost.length > 0 || filterTerm === g.t);

  const renderRow = (r, showStatus = true) => {
    const { course, myAmt, rank, total, topBid, avgBid, won, isLive } = r;
    const pct = topBid > 0 ? Math.round((myAmt / topBid) * 100) : 100;
    return (
      <div key={course.id}
        style={{ display:"flex", alignItems:"center", gap:14, padding:"13px 16px",
          borderRadius:10, marginBottom:6,
          background: won ? `${C.green}08` : isLive ? C.surface : `${C.yellow}06`,
          border: `1px solid ${won ? C.green+"40" : isLive ? C.border : C.yellow+"40"}` }}>

        {/* Status icon */}
        <div style={{ width:36, height:36, borderRadius:10, flexShrink:0,
          background: won ? `${C.green}18` : isLive ? `${C.red}12` : `${C.yellow}18`,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>
          {won ? "🏆" : isLive ? "❌" : "📋"}
        </div>

        {/* Course info */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.text,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:3 }}>
            {course.title}
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
            <Tag color={tc(course.term)} style={{ fontSize:10 }}>T{course.term}</Tag>
            <Tag color={cc(course.cluster)} style={{ fontSize:10 }}>C{course.cluster}</Tag>
            <Tag color={C.textDim} style={{ fontSize:10 }}>{course.credits}cr</Tag>
            {!isLive && <Tag color={C.yellow} style={{ fontSize:10 }}>Planned · not submitted</Tag>}
          </div>
        </div>

        {/* Bid bar */}
        <div style={{ width:100, flexShrink:0 }}>
          <div style={{ height:5, background:C.border, borderRadius:3, overflow:"hidden", marginBottom:2 }}>
            <div style={{ height:"100%", width:`${pct}%`, borderRadius:3,
              background: won ? C.green : isLive ? (rank <= Math.ceil(total/2) ? C.yellow : C.red) : C.yellow }}/>
          </div>
          <div style={{ fontSize:9, color:C.textDim, textAlign:"right" }}>
            {isLive ? `avg ${avgBid} · top ${topBid}` : `planned ${myAmt} pts`}
          </div>
        </div>

        {/* My bid */}
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontSize:18, fontWeight:800, fontFamily:"monospace",
            color: won ? C.green : isLive ? C.textSub : C.yellow }}>{myAmt}</div>
          <div style={{ fontSize:10, color:C.textDim }}>pts</div>
        </div>

        {/* Rank */}
        <div style={{ textAlign:"right", flexShrink:0, minWidth:52 }}>
          {isLive && rank > 0 ? (
            <>
              <div style={{ fontSize:15, fontWeight:800,
                color: rank === 1 ? C.gold : rank <= 3 ? C.silver : won ? C.green : C.textSub }}>
                {rank <= 3 ? ["🥇","🥈","🥉"][rank-1] : `#${rank}`}
              </div>
              <div style={{ fontSize:10, color:C.textDim }}>of {total}</div>
            </>
          ) : (
            <div style={{ fontSize:11, color:C.textDim }}>{isLive ? "—" : "Not bid"}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding:"28px" }}>

      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <h2 style={{ fontSize:20, fontWeight:800, color:C.text, margin:"0 0 4px" }}>My Bid Results</h2>
        <p style={{ fontSize:12, color:C.textSub, margin:0 }}>
          Shows where your live bids stand · top 50 bidders per subject used as reference
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:14, marginBottom:24 }}>
        {[
          { label:"Live Bids",      val:liveCount,   color:C.blue  },
          { label:"Leading / Won",  val:wonCount,    color:C.green },
          { label:"Planned",        val:planCount,   color:C.yellow },
          { label:"Credits (Won)",  val:`${totalCr}cr`, color:C.gold  },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background:C.surface, border:`1px solid ${C.border}`,
            borderTop:`3px solid ${color}`, borderRadius:12, padding:"16px 18px" }}>
            <div style={{ fontSize:28, fontWeight:800, color, fontFamily:"monospace" }}>{val}</div>
            <div style={{ fontSize:12, color:C.textSub, marginTop:4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Term filter */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {[0,4,5,6].map(t=>(
          <button key={t} onClick={()=>setFilterTerm(t)}
            style={{ padding:"8px 16px", borderRadius:8,
              border:`1px solid ${filterTerm===t ? (t?tc(t):C.accent) : C.border}`,
              background: filterTerm===t ? `${t?tc(t):C.accent}18` : "transparent",
              color: filterTerm===t ? (t?tc(t):C.accent) : C.textSub,
              cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:AVN }}>
            {t===0?"All Terms":`Term ${t}`}
          </button>
        ))}
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:C.textDim,
          background:C.surface, border:`1px dashed ${C.border}`, borderRadius:12 }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🎯</div>
          <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:6 }}>No bids or strategy planned yet</div>
          <div style={{ fontSize:13, color:C.textSub }}>
            Go to <strong>Bidding Strategy</strong>, add subjects, and your planned bids will appear here automatically.
          </div>
        </div>
      ) : (
        <>
          {/* Won section */}
          {results.filter(r=>r.won).length>0&&(
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.green, letterSpacing:.5, marginBottom:10,
                display:"flex", alignItems:"center", gap:8 }}>
                🏆 LEADING / LIKELY TO WIN ({results.filter(r=>r.won).length})
                <span style={{ fontWeight:400, color:C.textDim, fontSize:10 }}>
                  — your bid is within the top {" "}
                  {Math.max(...results.filter(r=>r.won).map(r=>r.course.sections))} bids
                </span>
              </div>
              {results.filter(r=>r.won).map(r=>renderRow(r))}
            </div>
          )}

          {/* Not leading / planned section */}
          {results.filter(r=>!r.won).length>0&&(
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.textSub, letterSpacing:.5, marginBottom:10 }}>
                📊 YOUR CURRENT STANDINGS ({results.filter(r=>!r.won).length})
              </div>
              {results.filter(r=>!r.won).map(r=>{
                const rankLabel = r.isLive && r.rank > 0
                  ? `#${r.rank} of top ${Math.min(r.total, 60)}`
                  : r.isLive ? "Not ranked yet" : "Planned — not submitted";
                const rankColor = r.isLive && r.rank > 0
                  ? (r.rank <= 10 ? C.yellow : C.textSub)
                  : C.textDim;
                return (
                  <div key={r.course.id} style={{ marginBottom:6 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:rankColor }}>{rankLabel}</span>
                    </div>
                    {renderRow(r)}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── LEADERBOARD PAGE ─────────────────────────────────────────
function LeaderboardPage({ allBids, allStudents, rollToName, user, coursesVersion, myBids }) {
  const [activeTerm,    setActiveTerm]    = useState(4);
  const [activeCluster, setActiveCluster] = useState(1);
  const [activeCourse,  setActiveCourse]  = useState(null);
  const [search,        setSearch]        = useState("");
  const [studentNames,  setStudentNames]  = useState({});

  // Live listener on students table — builds roll->name map
  useEffect(() => {
    const studentsRef = ref(db, "students");
    onValue(studentsRef, snap => {
      const data = snap.val() || {};
      const nameMap = {};
      Object.entries(data).forEach(([roll, s]) => {
        if (s?.name) nameMap[roll] = s.name;
      });
      setStudentNames(nameMap);
    });
    return () => off(studentsRef);
  }, []);

  const clusterCourses = useMemo(() =>
    COURSES.filter(c => c.term === activeTerm && c.cluster === activeCluster)
  , [activeTerm, activeCluster, coursesVersion]);

  useEffect(() => {
    setActiveCourse(prev => {
      const still = clusterCourses.find(c => c.id === prev?.id);
      return still || (clusterCourses[0] || null);
    });
  }, [activeTerm, activeCluster, coursesVersion]);

  const bidders = useMemo(() => {
    if (!activeCourse) return [];
    const bidMap = { ...(allBids[activeCourse.id] || {}) };
    // Ensure current user's bid is always reflected (from myBids as fallback)
    if (!bidMap[user.roll] && myBids[activeCourse.id] > 0) {
      bidMap[user.roll] = myBids[activeCourse.id];
    }
    const sorted = Object.entries(bidMap)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const ranked = sorted.map(([roll, amount], i) => ({ roll, amount, rank: i + 1 }));
    const inTop60 = ranked.slice(0, 60);
    const myEntry = ranked.find(e => e.roll === user.roll);
    const alreadyShown = inTop60.some(e => e.roll === user.roll);
    if (myEntry && !alreadyShown) return [...inTop60, myEntry];
    return inTop60;
  }, [allBids, myBids, activeCourse, user.roll]);

  const topAmt = bidders[0]?.amount || 1;

  const clusterStats = useMemo(() => clusterCourses.map(c => {
    const vals = Object.values(allBids[c.id] || {}).filter(v => v > 0);
    return {
      ...c,
      bidCount: vals.length,
      topBid: vals.length ? Math.max(...vals) : 0,
      avgBid: vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0,
    };
  }), [clusterCourses, allBids]);

  const termSearch = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return COURSES.filter(c => c.term === activeTerm &&
      (c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)));
  }, [search, activeTerm, coursesVersion]);

  const AVN = "'Nunito',system-ui,sans-serif";
  const getName = (roll) => {
    if (!roll) return roll;
    const key = roll.toUpperCase();
    return studentNames[key] || allStudents?.[key]?.name || allStudents?.[roll]?.name || roll;
  };

  return (
    <div style={{ padding: "28px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
        marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, color:C.text, margin:0 }}>Leaderboard</h2>
          <p style={{ fontSize:12, color:C.textSub, margin:"4px 0 0" }}>
            Live bid rankings — updates in real time as students bid
          </p>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={`Search Term ${activeTerm} subjects…`}
          style={{ padding:"8px 14px", background:C.surface, border:`1px solid ${C.border}`,
            borderRadius:8, color:C.text, fontSize:13, outline:"none", width:240, fontFamily:AVN }}/>
      </div>

      {/* Search results */}
      {search.trim() && termSearch.length > 0 && (
        <div style={{ background:C.surface, border:`1px solid ${C.border}`,
          borderRadius:10, marginBottom:16, overflow:"hidden" }}>
          <div style={{ padding:"7px 14px", fontSize:10, fontWeight:700, color:C.textSub,
            letterSpacing:.5, borderBottom:`1px solid ${C.border}` }}>
            RESULTS IN TERM {activeTerm}
          </div>
          {termSearch.map(c => {
            const vals = Object.values(allBids[c.id] || {}).filter(v => v > 0);
            return (
              <button key={c.id}
                onClick={() => { setActiveCluster(c.cluster); setActiveCourse(c); setSearch(""); }}
                style={{ display:"flex", alignItems:"center", gap:12, width:"100%",
                  padding:"10px 14px", background:"transparent", border:"none",
                  borderBottom:`1px solid ${C.border}`, cursor:"pointer",
                  textAlign:"left", fontFamily:AVN }}>
                <Tag color={cc(c.cluster)} style={{ fontSize:10, flexShrink:0 }}>C{c.cluster}</Tag>
                <span style={{ flex:1, fontSize:13, fontWeight:600, color:C.text,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.title}</span>
                {vals.length > 0 && (
                  <span style={{ fontSize:11, color:C.accent, flexShrink:0, whiteSpace:"nowrap" }}>
                    {vals.length} bids · top {Math.max(...vals)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Term tabs */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:10, fontWeight:700, color:C.textDim, letterSpacing:1, marginBottom:8 }}>TERM</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {[4, 5, 6].map(t => {
            const termBids = COURSES.filter(c => c.term === t)
              .reduce((s, c) => s + Object.values(allBids[c.id] || {}).filter(v => v > 0).length, 0);
            return (
              <button key={t} onClick={() => { setActiveTerm(t); setActiveCluster(1); setSearch(""); }}
                style={{ padding:"10px 22px", borderRadius:10,
                  border:`2px solid ${activeTerm === t ? tc(t) : C.border}`,
                  background: activeTerm === t ? `${tc(t)}18` : "transparent",
                  color: activeTerm === t ? tc(t) : C.textSub,
                  cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:AVN }}>
                Term {t}
                <div style={{ fontSize:10, fontWeight:500, marginTop:2,
                  color: activeTerm === t ? tc(t) : C.textDim }}>
                  {termBids} bids
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cluster tabs */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:10, fontWeight:700, color:C.textDim, letterSpacing:1, marginBottom:8 }}>CLUSTER</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {[1, 2, 3].map(cl => {
            const clCourses = COURSES.filter(c => c.term === activeTerm && c.cluster === cl);
            const totalBids = clCourses.reduce((s, c) =>
              s + Object.values(allBids[c.id] || {}).filter(v => v > 0).length, 0);
            return (
              <button key={cl} onClick={() => setActiveCluster(cl)}
                style={{ padding:"10px 20px", borderRadius:10,
                  border:`2px solid ${activeCluster === cl ? cc(cl) : C.border}`,
                  background: activeCluster === cl ? `${cc(cl)}18` : "transparent",
                  color: activeCluster === cl ? cc(cl) : C.textSub,
                  cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:AVN }}>
                Cluster {cl}
                <div style={{ fontSize:10, fontWeight:500, marginTop:2,
                  color: activeCluster === cl ? cc(cl) : C.textDim }}>
                  {clCourses.length} subjects · {totalBids} bids
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Two-pane layout */}
      <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>

        {/* Subject list */}
        <div style={{ width:280, flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:700, color:C.textDim, letterSpacing:1, marginBottom:10 }}>
            SUBJECTS · T{activeTerm} C{activeCluster}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {clusterStats.map(c => {
              const isActive = activeCourse?.id === c.id;
              return (
                <button key={c.id} onClick={() => setActiveCourse(c)}
                  style={{ padding:"10px 12px", textAlign:"left",
                    background: isActive ? `${C.accent}15` : C.surface,
                    border:`1px solid ${isActive ? C.accent + "70" : C.border}`,
                    borderLeft:`3px solid ${isActive ? C.accent : "transparent"}`,
                    borderRadius:8, cursor:"pointer", fontFamily:AVN }}>
                  <div style={{ fontSize:12, fontWeight: isActive ? 700 : 500,
                    color: isActive ? C.text : C.textSub,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:5 }}>
                    {c.title}
                  </div>
                  <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                    <Tag color={C.textDim} style={{ fontSize:9 }}>{c.credits}cr</Tag>
                    {c.bidCount > 0 ? (
                      <>
                        <span style={{ fontSize:10, color:C.green, fontWeight:600 }}>👥 {c.bidCount}</span>
                        <span style={{ fontSize:10, color:C.gold, fontWeight:700 }}>🏆 {c.topBid}</span>
                        {c.avgBid > 0 && <span style={{ fontSize:10, color:C.textSub }}>avg {c.avgBid}</span>}
                      </>
                    ) : (
                      <span style={{ fontSize:10, color:C.textDim, fontStyle:"italic" }}>No bids yet</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Leaderboard panel */}
        <div style={{ flex:1, minWidth:0 }}>
          {activeCourse ? (
            <>
              {/* Course info card */}
              <div style={{ background:C.surface, border:`1px solid ${C.border}`,
                borderRadius:12, padding:"16px 20px", marginBottom:14,
                borderTop:`3px solid ${cc(activeCourse.cluster)}` }}>
                <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                  <Tag color={tc(activeCourse.term)}>T{activeCourse.term}</Tag>
                  <Tag color={cc(activeCourse.cluster)}>C{activeCourse.cluster}</Tag>
                  <Tag color={C.textSub}>{activeCourse.credits}cr</Tag>
                  <Tag color={C.textSub}>{activeCourse.sections} section{activeCourse.sections > 1 ? "s" : ""}</Tag>
                  <Tag color={C.accent}>default {activeCourse.defaultBid ?? 100} pts</Tag>
                </div>
                <div style={{ fontSize:17, fontWeight:800, color:C.text, lineHeight:1.3 }}>
                  {activeCourse.title}
                </div>
                <div style={{ fontSize:12, color:C.blue, marginTop:4 }}>{activeCourse.prof}</div>
                {activeCourse.prereq && (
                  <div style={{ fontSize:11, color:C.yellow, marginTop:6,
                    background:`${C.yellow}12`, borderRadius:5,
                    padding:"3px 8px", display:"inline-block" }}>
                    📋 {activeCourse.prereq}
                  </div>
                )}

                {/* Live aggregate stats */}
                {bidders.length > 0 && (
                  <div style={{ display:"flex", gap:24, marginTop:14, paddingTop:14,
                    borderTop:`1px solid ${C.border}`, flexWrap:"wrap" }}>
                    {[
                      { label:"Top bid",   val: bidders[0].amount, color: C.gold },
                      { label:"Average",   val: Math.round(bidders.filter(e=>e.roll!==user.roll||true).reduce((s,e)=>s+e.amount,0)/bidders.length), color: C.blue },
                      { label:"Lowest",    val: bidders[bidders.length-1].amount, color: C.textSub },
                      { label:"Bidders",   val: bidders.length, color: C.green },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ textAlign:"center" }}>
                        <div style={{ fontSize:20, fontWeight:800, color, fontFamily:"monospace" }}>{val}</div>
                        <div style={{ fontSize:10, color:C.textDim, marginTop:2 }}>{label}</div>
                      </div>
                    ))}
                    {/* Your rank — always shown */}
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:20, fontWeight:800, color:C.accent, fontFamily:"monospace" }}>
                        {bidders.find(e=>e.roll===user.roll) ? `#${bidders.find(e=>e.roll===user.roll).rank}` : "—"}
                      </div>
                      <div style={{ fontSize:10, color:C.textDim, marginTop:2 }}>Your rank</div>
                    </div>
                  </div>
                )}
                {/* Show your rank even if no bids at all */}
                {bidders.length === 0 && (
                  <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:12, color:C.textDim }}>Your rank: </span>
                    <span style={{ fontSize:13, fontWeight:700, color:C.accent }}>Not bid yet</span>
                  </div>
                )}
              </div>

              {/* Bidder rows */}
              {bidders.length === 0 ? (
                <div style={{ textAlign:"center", color:C.textDim, padding:"48px 0",
                  background:C.surface, border:`1px dashed ${C.border}`,
                  borderRadius:12, fontSize:13 }}>
                  No bids yet on this subject.
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {bidders.map((e, i) => {
                    const medal = [C.gold, C.silver, C.bronze][i];
                    const isMe  = e.roll === user.roll;
                    const pct   = Math.round((e.amount / topAmt) * 100);
                    const displayName = isMe ? (user.name || user.roll).toUpperCase() : (() => {
                      const keys = [e.roll, e.roll?.toUpperCase(), e.roll?.toLowerCase()];
                      for (const k of keys) {
                        if (studentNames[k]) return studentNames[k].toUpperCase();
                        if (allStudents?.[k]?.name) return allStudents[k].name.toUpperCase();
                      }
                      return e.roll;
                    })();
                    const isAppended = i >= 60; // user appended outside top 60
                    return (
                      <div key={e.roll}>
                        {isAppended && (
                          <div style={{ textAlign:"center", color:C.textDim, fontSize:11,
                            padding:"6px 0", borderTop:`1px dashed ${C.border}`, marginBottom:5 }}>
                            ···  your position
                          </div>
                        )}
                        <div
                          style={{ display:"flex", alignItems:"center", gap:12,
                            padding:"12px 16px", borderRadius:10,
                            background: isMe ? `${C.blue}10` : i === 0 ? `${C.gold}08` : C.surface,
                            border:`1px solid ${isMe ? C.blue+"50" : i===0 ? C.gold+"30" : C.border}` }}>

                          <div style={{ width:32, flexShrink:0, textAlign:"center" }}>
                            {i < 3
                              ? <span style={{ fontSize:18 }}>{["🥇","🥈","🥉"][i]}</span>
                              : <span style={{ fontSize:13, fontWeight:700, color:C.textDim }}>#{e.rank}</span>}
                          </div>

                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600,
                              color: isMe ? C.accent : medal || C.text,
                              display:"flex", alignItems:"center", gap:6 }}>
                              {isMe ? `⭐ ${displayName}` : displayName}
                              {isMe && <Tag color={C.accent} style={{ fontSize:9 }}>you</Tag>}
                            </div>
                            <div style={{ fontSize:10, color:C.textDim, marginTop:1, fontFamily:"monospace" }}>
                              {e.roll}
                            </div>
                          </div>

                          <div style={{ width:100, flexShrink:0 }}>
                            <div style={{ height:5, background:C.border, borderRadius:3, overflow:"hidden" }}>
                              <div style={{ height:"100%", width:`${pct}%`, borderRadius:3,
                                background: i === 0 ? C.gold : isMe ? C.blue : C.textSub }}/>
                            </div>
                            <div style={{ fontSize:9, color:C.textDim, textAlign:"right", marginTop:2 }}>{pct}%</div>
                          </div>

                          <div style={{ fontSize:20, fontWeight:800, width:58, textAlign:"right",
                            flexShrink:0, color: i===0 ? C.gold : isMe ? C.accent : C.text,
                            fontFamily:"monospace" }}>
                            {e.amount}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign:"center", color:C.textDim, padding:"60px 0", fontSize:13 }}>
              Select a subject from the left to see its live leaderboard.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── BID MODAL ────────────────────────────────────────────────
function BidModal({ course,user,allBids,myBids,onBid,onClose,tokensLeft }) {
  const myBid        = myBids[course.id]||0;
  const {min,max}    = bidLimits(course);
  const [value,setValue] = useState(myBid||min);
  const sorted       = Object.entries(allBids[course.id]||{}).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const top          = sorted[0]?.[1]||0;
  const avail        = tokensLeft+myBid;
  const delta        = value-myBid;

  const warn = useMemo(()=>{
    if(value<min&&value>0)  return {lv:"err",msg:`Minimum bid is ${min}`};
    if(value>max)            return {lv:"err",msg:`Maximum bid is ${max}`};
    if(delta>avail)          return {lv:"err",msg:`Only ${avail} points available`};
    if(avail-delta<500&&delta>0) return {lv:"warn",msg:`Only ${avail-delta} points left after this bid`};
    return null;
  },[value,min,max,delta,avail]);

  const canBid = value>=min&&value<=max&&delta<=avail&&(!warn||warn.lv!=="err");
  const quick  = [top+10,top+25,top+50].filter(v=>v<=max&&v<=avail&&v>myBid);

  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,zIndex:700,
      background:"rgba(0,0,0,.8)",backdropFilter:"blur(8px)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ width:"min(500px,100%)",maxHeight:"90vh",overflowY:"auto",
          background:C.surface,border:`1px solid ${C.border}`,
          borderRadius:14,boxShadow:"0 24px 64px rgba(0,0,0,.7)" }}>
        <div style={{ height:3,borderRadius:"14px 14px 0 0",
          background:`linear-gradient(90deg,${tc(course.term)},${cc(course.cluster)})` }}/>
        <div style={{ padding:"24px 24px 28px" }}>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:18 }}>
            <div>
              <div style={{ display:"flex",gap:6,marginBottom:8,flexWrap:"wrap" }}>
                <Tag color={tc(course.term)}>Term {course.term}</Tag>
                <Tag color={cc(course.cluster)}>Cluster {course.cluster}</Tag>
                <Tag color={C.textSub}>{course.credits}cr</Tag>
                <Tag color={C.textDim}>Range {min}–{max}</Tag>
              </div>
              <div style={{ fontSize:17,fontWeight:700,color:C.text,marginBottom:4 }}>{course.title}</div>
              <div style={{ fontSize:12,color:"#79c0ff" }}>{course.prof}</div>
            </div>
            <button onClick={onClose} style={{ width:32,height:32,borderRadius:8,
              border:`1px solid ${C.border}`,background:C.bg,
              color:C.textSub,cursor:"pointer",fontSize:16,flexShrink:0 }}>✕</button>
          </div>

          {/* Live standings */}
          <div style={{ marginBottom:16,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden" }}>
            <div style={{ padding:"8px 12px",background:C.bg,fontSize:11,fontWeight:600,color:C.textSub }}>
              LIVE STANDINGS
            </div>
            {sorted.length===0
              ? <div style={{ padding:"12px",textAlign:"center",fontSize:12,color:C.textDim }}>No bids yet — be first</div>
              : sorted.slice(0,5).map(([roll,amount],i)=>{
                  const rc=[C.gold,C.silver,C.bronze][i]||C.textDim;
                  const isMe=roll===user.roll;
                  return (
                    <div key={roll} style={{ display:"flex",alignItems:"center",gap:8,
                      padding:"8px 12px",background:isMe?`${C.blue}18`:"transparent",
                      borderTop:"1px solid #0d1117" }}>
                      <span style={{ fontSize:12,fontWeight:700,color:rc,width:20 }}>#{i+1}</span>
                      <span style={{ flex:1,fontSize:12,color:isMe?C.text:C.textSub }}>{isMe?"You":roll}</span>
                      <span style={{ fontSize:15,fontWeight:700,color:i===0?C.gold:C.text,fontFamily:"monospace" }}>{amount}</span>
                    </div>
                  );
                })
            }
          </div>

          {/* Quick outbid */}
          {quick.length>0&&(
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11,fontWeight:600,color:C.textSub,marginBottom:8 }}>QUICK OUTBID</div>
              <div style={{ display:"flex",gap:8 }}>
                {quick.map(v=>(
                  <button key={v} onClick={()=>setValue(v)}
                    style={{ flex:1,padding:"9px",
                      background:value===v?`${C.blue}22`:C.bg,
                      border:`1px solid ${value===v?C.blue:C.border}`,
                      borderRadius:6,color:value===v?C.blue:C.text,
                      cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"monospace" }}>{v}</button>
                ))}
              </div>
            </div>
          )}

          {/* Big value display + Slider */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:8 }}>
              <span style={{ fontSize:12,fontWeight:600,color:C.textSub }}>BID AMOUNT</span>
              <span style={{ fontSize:12,color:C.textDim }}>{avail} pts available</span>
            </div>
            <div style={{ fontSize:38,fontWeight:800,fontFamily:"monospace",
              color:canBid?C.blue:C.red,textAlign:"center",marginBottom:12 }}>{value}</div>
            <input type="range" min={min} max={Math.min(max,avail)} step={10} value={value}
              onChange={e=>setValue(Number(e.target.value))}
              style={{ width:"100%",accentColor:C.blue,cursor:"pointer",height:20 }}/>
            <div style={{ display:"flex",justifyContent:"space-between",marginTop:4 }}>
              <span style={{ fontSize:10,color:C.textDim }}>min {min}</span>
              <span style={{ fontSize:10,color:C.textDim }}>max {Math.min(max,avail)}</span>
            </div>
          </div>

          {warn&&(
            <div style={{ padding:"9px 12px",borderRadius:8,marginBottom:12,fontSize:12,
              background:warn.lv==="err"?"rgba(239,68,68,.1)":"rgba(234,179,8,.1)",
              border:`1px solid ${warn.lv==="err"?C.red:C.yellow}40`,
              color:warn.lv==="err"?C.red:C.yellow }}>{warn.msg}</div>
          )}

          <button onClick={()=>canBid&&(onBid(course.id,value),onClose())} disabled={!canBid}
            style={{ width:"100%",padding:"14px",
              background:canBid?"#238636":C.border,
              border:`1px solid ${canBid?"#2ea043":C.border}`,
              borderRadius:8,color:canBid?"#fff":C.textDim,
              cursor:canBid?"pointer":"not-allowed",
              fontWeight:700,fontSize:14,fontFamily:"'Nunito',system-ui,sans-serif" }}>
            {myBid?"Update Bid":"Confirm Bid"} — {value} pts
          </button>

          {myBid>0&&(
            <button onClick={()=>{ onBid(course.id,0); onClose(); }}
              style={{ width:"100%",padding:"9px",marginTop:10,background:"transparent",
                border:`1px solid ${C.border}`,borderRadius:8,color:C.textDim,
                cursor:"pointer",fontSize:12,fontFamily:"'Nunito',system-ui,sans-serif" }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.red; e.currentTarget.style.color=C.red; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.textDim; }}>
              Withdraw bid (recover {myBid} pts)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── WRITE REVIEW MODAL ───────────────────────────────────────
function WriteReviewModal({ course,user,reviews,onSave,onClose }) {
  const existing=reviews.find(r=>r.cid===course.id&&r.roll===user.roll);
  const [sR,setSR]=useState(existing?.sRating||0);
  const [pR,setPR]=useState(existing?.pRating||0);
  const [txt,setTxt]=useState(existing?.text||"");
  const [anon,setAnon]=useState(existing?.anon||false);
  const [err,setErr]=useState("");

  const save=()=>{
    if(!sR||!pR) return setErr("Please rate both subject and professor");
    if(txt.trim().length<20) return setErr("Review must be at least 20 characters");
    onSave({cid:course.id,sRating:sR,pRating:pR,text:txt.trim(),anon,name:anon?"Anonymous":user.name});
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,zIndex:750,
      background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ width:"min(520px,100%)",maxHeight:"90vh",overflowY:"auto",
          background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:28 }}>
        <div style={{ display:"flex",justifyContent:"space-between",marginBottom:20 }}>
          <div>
            <div style={{ fontSize:17,fontWeight:700,color:C.text,marginBottom:4 }}>{course.title}</div>
            <div style={{ fontSize:12,color:"#79c0ff" }}>{course.prof}</div>
          </div>
          <button onClick={onClose} style={{ width:32,height:32,borderRadius:8,
            border:`1px solid ${C.border}`,background:C.bg,color:C.textSub,cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:18 }}>
          {[["Subject Rating",sR,setSR],["Professor Rating",pR,setPR]].map(([lbl,v,setter])=>(
            <div key={lbl} style={{ padding:14,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8 }}>
              <div style={{ fontSize:12,fontWeight:600,color:C.textSub,marginBottom:8 }}>{lbl}</div>
              <StarRow val={v} onChange={setter} size={26}/>
              {v>0&&<div style={{ fontSize:12,color:C.gold,marginTop:4 }}>
                {["","Poor","Fair","Good","Great","Excellent"][v]} ({v}/5)
              </div>}
            </div>
          ))}
        </div>
        <textarea value={txt} onChange={e=>setTxt(e.target.value)}
          placeholder="Share your experience (min 20 chars)…" rows={4}
          style={{ width:"100%",padding:"12px 14px",background:C.bg,
            border:`1px solid ${C.border}`,borderRadius:8,color:C.text,
            fontSize:13,outline:"none",resize:"vertical",
            fontFamily:"'Nunito',system-ui,sans-serif",boxSizing:"border-box",marginBottom:14 }}/>
        <div onClick={()=>setAnon(a=>!a)}
          style={{ display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:16 }}>
          <div style={{ width:36,height:20,borderRadius:10,
            background:anon?`${C.blue}40`:C.border,position:"relative",transition:"background .2s" }}>
            <div style={{ width:14,height:14,borderRadius:"50%",
              background:anon?C.blue:C.textDim,position:"absolute",
              top:3,left:anon?19:3,transition:"left .2s" }}/>
          </div>
          <span style={{ fontSize:13,color:anon?C.blue:C.textSub }}>Post anonymously</span>
        </div>
        {err&&<div style={{ padding:"10px 12px",background:"rgba(239,68,68,.1)",
          border:"1px solid rgba(239,68,68,.3)",borderRadius:8,
          fontSize:12,color:C.red,marginBottom:14 }}>{err}</div>}
        <button onClick={save}
          style={{ width:"100%",padding:"13px",background:"#238636",
            border:"1px solid #2ea043",borderRadius:8,color:"#fff",
            fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"'Nunito',system-ui,sans-serif" }}>
          {existing?"Update Review":"Submit Review"}
        </button>
      </div>
    </div>
  );
}

// ─── REVIEW DETAIL MODAL ──────────────────────────────────────
function ReviewDetailModal({ course,reviews,user,onWrite,onDelete,onClose }) {
  const revs=reviews.filter(r=>r.cid===course.id);
  const avgS=revs.length?(revs.reduce((s,r)=>s+r.sRating,0)/revs.length).toFixed(1):null;
  const avgP=revs.length?(revs.reduce((s,r)=>s+r.pRating,0)/revs.length).toFixed(1):null;
  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,zIndex:750,
      background:"rgba(0,0,0,.85)",backdropFilter:"blur(10px)",
      overflow:"auto",padding:24,display:"flex",justifyContent:"center" }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ width:"min(700px,100%)",height:"fit-content",
          background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:28 }}>
        <div style={{ display:"flex",justifyContent:"space-between",marginBottom:20 }}>
          <div>
            <div style={{ display:"flex",gap:6,marginBottom:8 }}>
              <Tag color={tc(course.term)}>Term {course.term}</Tag>
              <Tag color={cc(course.cluster)}>Cluster {course.cluster}</Tag>
            </div>
            <div style={{ fontSize:20,fontWeight:800,color:C.text,marginBottom:6 }}>{course.title}</div>
            <div style={{ fontSize:13,color:"#79c0ff" }}>{course.prof}</div>
          </div>
          <button onClick={onClose} style={{ width:34,height:34,borderRadius:8,
            border:`1px solid ${C.border}`,background:C.bg,color:C.textSub,cursor:"pointer" }}>✕</button>
        </div>
        {avgS&&(
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20 }}>
            {[["Subject",avgS],["Professor",avgP]].map(([lbl,avg])=>(
              <div key={lbl} style={{ padding:16,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8 }}>
                <div style={{ fontSize:11,fontWeight:600,color:C.textSub,marginBottom:8 }}>{lbl.toUpperCase()} RATING</div>
                <div style={{ display:"flex",alignItems:"baseline",gap:6,marginBottom:6 }}>
                  <span style={{ fontSize:36,fontWeight:800,color:C.gold }}>{avg}</span>
                  <span style={{ color:C.textDim }}>/5</span>
                </div>
                <StarRow val={Math.round(avg)} size={16}/>
              </div>
            ))}
          </div>
        )}
        <button onClick={onWrite}
          style={{ width:"100%",padding:"11px",background:"#238636",
            border:"1px solid #2ea043",borderRadius:8,color:"#fff",
            fontWeight:700,fontSize:13,cursor:"pointer",
            fontFamily:"'Nunito',system-ui,sans-serif",marginBottom:20 }}>
          + Write a Review
        </button>
        {revs.length===0&&<div style={{ textAlign:"center",color:C.textDim,padding:"24px 0" }}>No reviews yet.</div>}
        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
          {revs.map((rev,i)=>{
            const isMyReview = rev.roll===user.roll;
            return (
              <div key={i} style={{ padding:"14px",background:isMyReview?`${C.blue}08`:C.bg,
                border:`1px solid ${isMyReview?C.blue+"40":C.border}`,borderRadius:8 }}>
                <div style={{ display:"flex",gap:8,alignItems:"flex-start",marginBottom:8 }}>
                  <div style={{ width:30,height:30,borderRadius:"50%",background:C.card,
                    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                    fontSize:12,fontWeight:700,color:C.textSub }}>
                    {rev.anon?"?":(rev.name||rev.roll||"?")[0]}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13,fontWeight:600,color:C.text,display:"flex",alignItems:"center",gap:6 }}>
                      {rev.anon?"Anonymous":(rev.name||rev.roll)}
                      {isMyReview&&<Tag color={C.blue} style={{ fontSize:9 }}>you</Tag>}
                    </div>
                    <div style={{ display:"flex",gap:8,alignItems:"center",marginTop:2 }}>
                      <span style={{ fontSize:10,color:C.textDim }}>Subject</span><StarRow val={rev.sRating} size={11}/>
                      <span style={{ fontSize:10,color:C.textDim }}>Prof</span><StarRow val={rev.pRating} size={11}/>
                    </div>
                  </div>
                  {isMyReview&&(
                    <div style={{ display:"flex",gap:6,flexShrink:0 }}>
                      <button onClick={onWrite}
                        style={{ padding:"4px 10px",background:"transparent",
                          border:`1px solid ${C.border}`,borderRadius:6,
                          color:C.textSub,cursor:"pointer",fontSize:11,
                          fontFamily:"'Nunito',sans-serif" }}>
                        ✏️ Edit
                      </button>
                      <button onClick={()=>{ if(!window.confirm("Delete your review?")) return; onDelete(course.id); onClose(); }}
                        style={{ padding:"4px 10px",background:"rgba(239,68,68,.08)",
                          border:`1px solid rgba(239,68,68,.35)`,borderRadius:6,
                          color:C.red,cursor:"pointer",fontSize:11,
                          fontFamily:"'Nunito',sans-serif" }}>
                        🗑 Delete
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ fontSize:13,color:C.textSub,lineHeight:1.5 }}>{rev.text}</div>
                {rev.ts&&<div style={{ fontSize:10,color:C.textDim,marginTop:6 }}>
                  {new Date(rev.ts).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}
                </div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
