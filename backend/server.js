const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// In-Memory Database for Candidates
let candidates = [
  {
    id: 'priyam-1',
    name: 'Priyam',
    roleTag: 'Quiet Builder / Introvert',
    skills: ['C++', 'DSA', 'Backend', 'Problem Solving'],
    proofOfWork: '350+ LeetCode solved',
    availability: 'Open to Hackathon Teams & Dev Groups',
    resumeFileName: 'Priyam_CPP_Resume.pdf',
    github: 'https://github.com',
    portfolio: 'https://leetcode.com',
    connected: false,
    createdAt: new Date('2026-11-01T10:00:00Z').toISOString()
  },
  {
    id: 'ankan-2',
    name: 'Ankan',
    roleTag: 'UI Specialist',
    skills: ['React', 'Tailwind UI', 'TypeScript', 'Frontend'],
    proofOfWork: '3 deployed apps',
    availability: 'Open to Hackathon Teams & Dev Groups',
    resumeFileName: 'Ankan_Frontend_Resume.pdf',
    github: 'https://github.com',
    portfolio: 'https://ankan.dev',
    connected: false,
    createdAt: new Date('2026-11-02T11:00:00Z').toISOString()
  },
  {
    id: 'devina-3',
    name: 'Devina',
    roleTag: 'Systems & Distributed Engine',
    skills: ['Rust', 'Distributed Systems', 'Go', 'Docker'],
    proofOfWork: 'Custom Raft consensus engine | 280+ LeetCode solved',
    availability: 'Open to Hackathon Teams & Dev Groups',
    resumeFileName: 'Devina_Systems_CV.pdf',
    github: 'https://github.com',
    portfolio: '',
    connected: false,
    createdAt: new Date('2026-11-03T09:30:00Z').toISOString()
  },
  {
    id: 'rohan-4',
    name: 'Rohan',
    roleTag: 'Algorithm & AI Specialist',
    skills: ['Python', 'PyTorch', 'C++', 'FastAPI'],
    proofOfWork: 'Top 3% Kaggle | 400+ LeetCode solved',
    availability: 'Open to Hackathon Teams & Dev Groups',
    resumeFileName: 'Rohan_ML_Researcher.pdf',
    github: 'https://github.com',
    portfolio: 'https://kaggle.com',
    connected: false,
    createdAt: new Date('2026-11-04T14:20:00Z').toISOString()
  },
  {
    id: 'sneha-5',
    name: 'Sneha',
    roleTag: 'Full Stack Product Engineer',
    skills: ['Next.js', 'React', 'Node.js', 'PostgreSQL'],
    proofOfWork: 'Campus dev portal with 6k+ MAU',
    availability: 'Open to Hackathon Teams & Dev Groups',
    resumeFileName: 'Sneha_Fullstack.pdf',
    github: 'https://github.com',
    portfolio: '',
    connected: false,
    createdAt: new Date('2026-11-05T08:15:00Z').toISOString()
  },
  {
    id: 'arjun-6',
    name: 'Arjun',
    roleTag: 'Competitive Programmer',
    skills: ['C++', 'Algorithms', 'DSA', 'Graph Theory'],
    proofOfWork: 'Codeforces Candidate Master | 500+ LeetCode solved',
    availability: 'Open to Hackathon Teams & Dev Groups',
    resumeFileName: '',
    github: 'https://github.com',
    portfolio: 'https://codeforces.com',
    connected: false,
    createdAt: new Date('2026-11-05T12:00:00Z').toISOString()
  }
];

// In-Memory Database for Developer Groups & Hackathon Teams
let groups = [
  {
    id: 'team-alpha',
    name: 'Team Alpha (Hyperfusion 2K26)',
    seeking: '1 C++ / Systems Builder',
    project: 'Low-latency streaming platform',
    currentMembers: 3,
    maxMembers: 4,
    tags: ['C++', 'Low-Latency', 'Systems', 'Distributed Systems'],
    applied: false,
    applicants: []
  },
  {
    id: 'web3-builders',
    name: 'Web3 Builders',
    seeking: '1 Frontend UI dev (React/Tailwind)',
    project: 'Decentralized identity portal',
    currentMembers: 2,
    maxMembers: 4,
    tags: ['React', 'Tailwind UI', 'TypeScript', 'Web3'],
    applied: false,
    applicants: []
  },
  {
    id: 'ai-research-pod',
    name: 'AI Research Pod',
    seeking: '1 Python / ML Engineer',
    project: 'Computer Vision sign language detector',
    currentMembers: 3,
    maxMembers: 4,
    tags: ['Python', 'PyTorch', 'Computer Vision', 'FastAPI'],
    applied: false,
    applicants: []
  }
];

/**
 * GET /api/candidates?search=...
 * Returns candidate cards filtered by name, skill, role, or proof-of-work (case-insensitive token search).
 */
app.get('/api/candidates', (req, res) => {
  const search = (req.query.search || '').trim().toLowerCase();

  if (!search) {
    return res.json(candidates);
  }

  const tokens = search.split(/\s+/).filter(Boolean);

  const filtered = candidates.filter(candidate => {
    const nameLower = candidate.name.toLowerCase();
    const skillsLower = (candidate.skills || []).map(s => s.toLowerCase());
    const proofLower = (candidate.proofOfWork || '').toLowerCase();
    const roleTagLower = (candidate.roleTag || '').toLowerCase();
    const corpus = `${nameLower} ${skillsLower.join(' ')} ${proofLower} ${roleTagLower}`;

    // Direct substring match
    if (corpus.includes(search)) return true;
    if (nameLower.includes(search)) return true;
    if (skillsLower.some(skill => skill.includes(search) || search.includes(skill))) return true;
    if (proofLower.includes(search)) return true;

    // Multi-token match: do all tokens match any field in the corpus?
    if (tokens.every(token => corpus.includes(token))) return true;

    // Token match against name, skills, or proof-of-work
    return tokens.some(token =>
      nameLower.includes(token) ||
      skillsLower.some(s => s.includes(token)) ||
      proofLower.includes(token)
    );
  });

  res.json(filtered);
});

/**
 * POST /api/candidates
 * Creates and persists a new candidate profile (e.g., quiet builders publishing their proof-of-work).
 */
app.post('/api/candidates', (req, res) => {
  const {
    name,
    roleTag,
    skills,
    proofOfWork,
    availability,
    resumeFileName,
    resumeData,
    github,
    portfolio
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Full Name is required to publish a candidate profile.'
    });
  }

  // Parse skills from array or comma-separated string
  let parsedSkills = [];
  if (Array.isArray(skills)) {
    parsedSkills = skills.map(s => String(s).trim()).filter(Boolean);
  } else if (typeof skills === 'string') {
    parsedSkills = skills.split(',').map(s => s.trim()).filter(Boolean);
  }

  if (parsedSkills.length === 0) {
    parsedSkills = ['Problem Solving'];
  }

  const newCandidate = {
    id: `cand-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: name.trim(),
    roleTag: (roleTag && roleTag.trim()) || 'Quiet Builder / Engineer',
    skills: parsedSkills,
    proofOfWork: (proofOfWork && proofOfWork.trim()) || 'Verified Independent Project Builder',
    availability: (availability && availability.trim()) || 'Open to Hackathon Teams & Dev Groups',
    resumeFileName: resumeFileName || '',
    resumeData: resumeData || '',
    github: github || '',
    portfolio: portfolio || '',
    connected: false,
    createdAt: new Date().toISOString()
  };

  // Add to top of candidate list
  candidates.unshift(newCandidate);

  res.status(201).json({
    success: true,
    message: 'Profile published successfully! Your proof-of-work is now discoverable.',
    candidate: newCandidate
  });
});

/**
 * POST /api/invitations
 * Receives { candidateId, role, message }, sets connected: true for that candidate,
 * and returns { success: true, candidateName, role }.
 */
app.post('/api/invitations', (req, res) => {
  const { candidateId, role, message } = req.body;

  if (!candidateId) {
    return res.status(400).json({
      success: false,
      message: 'candidateId is required'
    });
  }

  const targetId = String(candidateId).toLowerCase();
  const candidate = candidates.find(c => 
    c.id.toLowerCase() === targetId ||
    c.name.toLowerCase() === targetId
  );

  if (!candidate) {
    return res.status(404).json({
      success: false,
      message: `Candidate with id "${candidateId}" not found`
    });
  }

  // Mark candidate connected status as true
  candidate.connected = true;

  const assignedRole = role || 'Backend C++ Developer';

  res.status(200).json({
    success: true,
    candidateName: candidate.name,
    role: assignedRole,
    message: message || '',
    connected: true
  });
});

/**
 * GET /api/groups
 * Returns active developer groups and hackathon teams seeking talent.
 */
app.get('/api/groups', (req, res) => {
  res.json(groups);
});

/**
 * POST /api/groups/join
 * Receives { groupId, candidateId, candidateName, note }, applies candidate to group.
 */
app.post('/api/groups/join', (req, res) => {
  const { groupId, candidateId, candidateName, note } = req.body;

  if (!groupId) {
    return res.status(400).json({
      success: false,
      message: 'groupId is required'
    });
  }

  const group = groups.find(g => g.id === groupId);
  if (!group) {
    return res.status(404).json({
      success: false,
      message: `Group with id "${groupId}" not found`
    });
  }

  // Mark group as applied
  group.applied = true;
  group.applicants.push({
    candidateId: candidateId || 'user-profile',
    candidateName: candidateName || 'Quiet Builder',
    note: note || '',
    appliedAt: new Date().toISOString()
  });

  res.status(200).json({
    success: true,
    groupId: group.id,
    groupName: group.name,
    message: `Application sent to ${group.name} leads! Successfully submitted proof-of-work.`
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    candidatesCount: candidates.length,
    groupsCount: groups.length,
    timestamp: new Date().toISOString()
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Talent Bridge Backend running on http://localhost:${PORT}`);
});
