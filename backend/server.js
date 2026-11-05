const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// In-Memory Mock Database
let candidates = [
  {
    id: 'priyam-1',
    name: 'Priyam',
    roleTag: 'Quiet Builder / Introvert',
    skills: ['C++', 'DSA', 'Backend', 'Problem Solving'],
    proofOfWork: '350+ LeetCode solved',
    availability: 'Open to Hackathon Teams & Dev Groups',
    connected: false
  },
  {
    id: 'ankan-2',
    name: 'Ankan',
    roleTag: 'UI Specialist',
    skills: ['React', 'Tailwind UI', 'TypeScript', 'Frontend'],
    proofOfWork: '3 deployed apps',
    availability: 'Open to Hackathon Teams & Dev Groups',
    connected: false
  },
  {
    id: 'devina-3',
    name: 'Devina',
    roleTag: 'Systems & Distributed Engine',
    skills: ['Rust', 'Distributed Systems', 'Go', 'Docker'],
    proofOfWork: 'Custom Raft consensus engine | 280+ LeetCode solved',
    availability: 'Open to Hackathon Teams & Dev Groups',
    connected: false
  },
  {
    id: 'rohan-4',
    name: 'Rohan',
    roleTag: 'Algorithm & AI Specialist',
    skills: ['Python', 'PyTorch', 'C++', 'FastAPI'],
    proofOfWork: 'Top 3% Kaggle | 400+ LeetCode solved',
    availability: 'Open to Hackathon Teams & Dev Groups',
    connected: false
  },
  {
    id: 'sneha-5',
    name: 'Sneha',
    roleTag: 'Full Stack Product Engineer',
    skills: ['Next.js', 'React', 'Node.js', 'PostgreSQL'],
    proofOfWork: 'Campus dev portal with 6k+ MAU',
    availability: 'Open to Hackathon Teams & Dev Groups',
    connected: false
  },
  {
    id: 'arjun-6',
    name: 'Arjun',
    roleTag: 'Competitive Programmer',
    skills: ['C++', 'Algorithms', 'DSA', 'Graph Theory'],
    proofOfWork: 'Codeforces Candidate Master | 500+ LeetCode solved',
    availability: 'Open to Hackathon Teams & Dev Groups',
    connected: false
  }
];

/**
 * GET /api/candidates?search=...
 * Returns candidate cards filtered by name, skill, or proof-of-work (case-insensitive token search).
 */
app.get('/api/candidates', (req, res) => {
  const search = (req.query.search || '').trim().toLowerCase();

  if (!search) {
    return res.json(candidates);
  }

  const tokens = search.split(/\s+/).filter(Boolean);

  const filtered = candidates.filter(candidate => {
    const nameLower = candidate.name.toLowerCase();
    const skillsLower = candidate.skills.map(s => s.toLowerCase());
    const proofLower = candidate.proofOfWork.toLowerCase();
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Talent Bridge Backend running on http://localhost:${PORT}`);
});
