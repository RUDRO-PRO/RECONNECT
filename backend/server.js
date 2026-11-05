const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kindred';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initial Default Seed Data
const SEED_CANDIDATES = [
  {
    name: 'Priyam',
    roleTag: 'Quiet Builder / Introvert',
    skills: ['C++', 'DSA', 'Backend', 'Problem Solving'],
    proofOfWork: '350+ LeetCode solved',
    availability: 'Open to Hackathon Teams & Dev Groups',
    resumeFileName: 'Priyam_CPP_Resume.pdf',
    github: 'https://github.com',
    portfolio: 'https://leetcode.com',
    connected: false
  },
  {
    name: 'Ankan',
    roleTag: 'UI Specialist',
    skills: ['React', 'Tailwind UI', 'TypeScript', 'Frontend'],
    proofOfWork: '3 deployed apps',
    availability: 'Open to Hackathon Teams & Dev Groups',
    resumeFileName: 'Ankan_Frontend_Resume.pdf',
    github: 'https://github.com',
    portfolio: 'https://ankan.dev',
    connected: false
  },
  {
    name: 'Devina',
    roleTag: 'Systems & Distributed Engine',
    skills: ['Rust', 'Distributed Systems', 'Go', 'Docker'],
    proofOfWork: 'Custom Raft consensus engine | 280+ LeetCode solved',
    availability: 'Open to Hackathon Teams & Dev Groups',
    resumeFileName: 'Devina_Systems_CV.pdf',
    github: 'https://github.com',
    portfolio: '',
    connected: false
  },
  {
    name: 'Rohan',
    roleTag: 'Algorithm & AI Specialist',
    skills: ['Python', 'PyTorch', 'C++', 'FastAPI'],
    proofOfWork: 'Top 3% Kaggle | 400+ LeetCode solved',
    availability: 'Open to Hackathon Teams & Dev Groups',
    resumeFileName: 'Rohan_ML_Researcher.pdf',
    github: 'https://github.com',
    portfolio: 'https://kaggle.com',
    connected: false
  },
  {
    name: 'Sneha',
    roleTag: 'Full Stack Product Engineer',
    skills: ['Next.js', 'React', 'Node.js', 'PostgreSQL'],
    proofOfWork: 'Campus dev portal with 6k+ MAU',
    availability: 'Open to Hackathon Teams & Dev Groups',
    resumeFileName: 'Sneha_Fullstack.pdf',
    github: 'https://github.com',
    portfolio: '',
    connected: false
  },
  {
    name: 'Arjun',
    roleTag: 'Competitive Programmer',
    skills: ['C++', 'Algorithms', 'DSA', 'Graph Theory'],
    proofOfWork: 'Codeforces Candidate Master | 500+ LeetCode solved',
    availability: 'Open to Hackathon Teams & Dev Groups',
    resumeFileName: '',
    github: 'https://github.com',
    portfolio: 'https://codeforces.com',
    connected: false
  }
];

const SEED_GROUPS = [
  {
    name: 'Team Alpha (Hyperfusion 2K26)',
    seeking: '1 C++ / Systems Builder',
    project: 'Low-latency streaming platform',
    membersCount: 3,
    maxMembers: 4,
    members: ['Alex (Lead)', 'Tara (DevOps)', 'Kunal (Arch)'],
    tags: ['C++', 'Low-Latency', 'Systems', 'Distributed Systems'],
    applied: false,
    applicants: []
  },
  {
    name: 'Web3 Builders',
    seeking: '1 Frontend UI dev (React/Tailwind)',
    project: 'Decentralized identity portal',
    membersCount: 2,
    maxMembers: 4,
    members: ['Vikram (Smart Contracts)', 'Elena (Product)'],
    tags: ['React', 'Tailwind UI', 'TypeScript', 'Web3'],
    applied: false,
    applicants: []
  },
  {
    name: 'AI Research Pod',
    seeking: '1 Python / ML Engineer',
    project: 'Computer Vision sign language detector',
    membersCount: 3,
    maxMembers: 4,
    members: ['Dr. Sarah (NLP)', 'Mei (CV Lead)', 'Rahul (Cloud)'],
    tags: ['Python', 'PyTorch', 'Computer Vision', 'FastAPI'],
    applied: false,
    applicants: []
  }
];

// Fallback in-memory stores in case MongoDB is offline during initial local boot
let memUsers = [];
let memCandidates = JSON.parse(JSON.stringify(SEED_CANDIDATES)).map((c, i) => ({ ...c, id: `cand-${i + 1}`, _id: `cand-${i + 1}`, createdAt: new Date() }));
let memGroups = JSON.parse(JSON.stringify(SEED_GROUPS)).map((g, i) => ({ ...g, id: `group-${i + 1}`, _id: `group-${i + 1}`, createdAt: new Date() }));

// -----------------------------------------------------------------------------
// 1. MONGOOSE SCHEMAS & MODELS
// -----------------------------------------------------------------------------

// User / Auth Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Candidate Profile Schema
const candidateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  name: { type: String, required: true, trim: true },
  roleTag: { type: String, default: 'Quiet Builder / Introvert', trim: true },
  skills: { type: [String], default: [] },
  proofOfWork: { type: String, default: 'Verified Autonomous Project Builder', trim: true },
  availability: { type: String, default: 'Open to Hackathon Teams & Dev Groups', trim: true },
  resumeFileName: { type: String, default: '' },
  resumeUrl: { type: String, default: '' },
  github: { type: String, default: '' },
  portfolio: { type: String, default: '' },
  connected: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Group / Hackathon Team Schema
const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  leaderId: { type: mongoose.Schema.Types.Mixed, default: 'anonymous' },
  seeking: { type: String, required: true, trim: true },
  project: { type: String, required: true, trim: true },
  membersCount: { type: Number, default: 1 },
  maxMembers: { type: Number, default: 4 },
  members: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  applied: { type: Boolean, default: false },
  applicants: [
    {
      candidateId: { type: String },
      candidateName: { type: String },
      note: { type: String },
      appliedAt: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Candidate = mongoose.model('Candidate', candidateSchema);
const Group = mongoose.model('Group', groupSchema);

let isMongoConnected = false;

// Connect to MongoDB
async function connectMongoDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 2500
    });
    isMongoConnected = true;
    console.log(`[MongoDB] Connected successfully to ${MONGODB_URI}`);

    // Seed initial candidates if empty
    const candCount = await Candidate.countDocuments();
    if (candCount === 0) {
      await Candidate.insertMany(SEED_CANDIDATES);
      console.log('[MongoDB] Seeded 6 initial candidate profiles.');
    }

    // Seed initial groups if empty
    const groupCount = await Group.countDocuments();
    if (groupCount === 0) {
      await Group.insertMany(SEED_GROUPS);
      console.log('[MongoDB] Seeded 3 initial developer groups.');
    }
  } catch (err) {
    isMongoConnected = false;
    console.warn(`[MongoDB Notice] Could not connect to MongoDB at ${MONGODB_URI} (${err.message}).`);
    console.warn('[MongoDB Notice] Operating with in-memory resilient data store. Endpoints remain fully functional.');
  }
}

connectMongoDB();

// -----------------------------------------------------------------------------
// 2. AUTH REST API ROUTES
// -----------------------------------------------------------------------------

/**
 * POST /api/auth/signup
 * Create new user in MongoDB with bcrypt password hashing
 */
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are all required.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(password, 10);

    if (isMongoConnected) {
      const existingUser = await User.findOne({ email: cleanEmail });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email address already exists.'
        });
      }

      const newUser = new User({
        name: name.trim(),
        email: cleanEmail,
        password: hashedPassword
      });
      await newUser.save();

      return res.status(201).json({
        success: true,
        message: 'Account created successfully!',
        user: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          createdAt: newUser.createdAt
        }
      });
    } else {
      // In-memory fallback
      const existing = memUsers.find(u => u.email === cleanEmail);
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email address already exists.'
        });
      }
      const newUser = {
        id: `user-${Date.now()}`,
        _id: `user-${Date.now()}`,
        name: name.trim(),
        email: cleanEmail,
        password: hashedPassword,
        createdAt: new Date()
      };
      memUsers.push(newUser);
      return res.status(201).json({
        success: true,
        message: 'Account created successfully! (local session)',
        user: { id: newUser.id, name: newUser.name, email: newUser.email, createdAt: newUser.createdAt }
      });
    }
  } catch (err) {
    console.error('Error in /api/auth/signup:', err);
    res.status(500).json({ success: false, message: 'Server error creating user account.' });
  }
});

/**
 * POST /api/auth/signin
 * Validate user login credentials
 */
app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    let user = null;
    if (isMongoConnected) {
      user = await User.findOne({ email: cleanEmail });
    } else {
      user = memUsers.find(u => u.email === cleanEmail);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. User not found.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Incorrect password.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Signed in successfully!',
      user: {
        id: user._id || user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error('Error in /api/auth/signin:', err);
    res.status(500).json({ success: false, message: 'Server error processing signin.' });
  }
});

// -----------------------------------------------------------------------------
// 3. CANDIDATES / PROFILES REST API ROUTES
// -----------------------------------------------------------------------------

/**
 * GET /api/candidates?search=...
 * Query MongoDB candidates matching regex on name, skills, or proofOfWork
 */
app.get('/api/candidates', async (req, res) => {
  try {
    const search = (req.query.search || '').trim();

    if (isMongoConnected) {
      let query = {};
      if (search) {
        const regex = new RegExp(search.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
        const tokens = search.split(/\s+/).filter(Boolean).map(t => new RegExp(t.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i'));
        
        query = {
          $or: [
            { name: regex },
            { roleTag: regex },
            { proofOfWork: regex },
            { skills: { $in: tokens } },
            { skills: regex }
          ]
        };
      }

      const candidates = await Candidate.find(query).sort({ createdAt: -1 });
      return res.json(candidates);
    } else {
      // In-memory fallback
      if (!search) {
        return res.json(memCandidates);
      }
      const sLower = search.toLowerCase();
      const filtered = memCandidates.filter(c => {
        const corpus = `${c.name} ${(c.skills || []).join(' ')} ${c.proofOfWork} ${c.roleTag}`.toLowerCase();
        return corpus.includes(sLower);
      });
      return res.json(filtered);
    }
  } catch (err) {
    console.error('Error in GET /api/candidates:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve candidates' });
  }
});

/**
 * POST /api/candidates
 * Create a new talent profile in MongoDB
 */
app.post('/api/candidates', async (req, res) => {
  try {
    const {
      name,
      roleTag,
      skills,
      proofOfWork,
      availability,
      resumeFileName,
      resumeUrl,
      github,
      portfolio,
      userId
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Full Name is required to publish a candidate profile.'
      });
    }

    let parsedSkills = [];
    if (Array.isArray(skills)) {
      parsedSkills = skills.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof skills === 'string') {
      parsedSkills = skills.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (parsedSkills.length === 0) {
      parsedSkills = ['Software Engineering', 'Problem Solving'];
    }

    const candidateData = {
      name: name.trim(),
      roleTag: (roleTag && roleTag.trim()) || 'Quiet Builder / Engineer',
      skills: parsedSkills,
      proofOfWork: (proofOfWork && proofOfWork.trim()) || 'Verified Independent Project Builder',
      availability: (availability && availability.trim()) || 'Open to Hackathon Teams & Dev Groups',
      resumeFileName: resumeFileName || '',
      resumeUrl: resumeUrl || '',
      github: github || '',
      portfolio: portfolio || '',
      connected: false,
      userId: userId || null,
      createdAt: new Date()
    };

    if (isMongoConnected) {
      const newCand = new Candidate(candidateData);
      await newCand.save();
      return res.status(201).json({
        success: true,
        message: 'Profile published successfully! Your proof-of-work is now discoverable.',
        candidate: newCand
      });
    } else {
      const newCand = {
        id: `cand-${Date.now()}`,
        _id: `cand-${Date.now()}`,
        ...candidateData
      };
      memCandidates.unshift(newCand);
      return res.status(201).json({
        success: true,
        message: 'Profile published successfully! Your proof-of-work is now discoverable.',
        candidate: newCand
      });
    }
  } catch (err) {
    console.error('Error in POST /api/candidates:', err);
    res.status(500).json({ success: false, message: 'Failed to create candidate profile.' });
  }
});

/**
 * POST /api/candidates/:id/connect
 * Set connected: true and log the invite
 */
app.post('/api/candidates/:id/connect', async (req, res) => {
  try {
    const { id } = req.params;
    const { role, message } = req.body;

    let candidate = null;

    if (isMongoConnected) {
      if (mongoose.Types.ObjectId.isValid(id)) {
        candidate = await Candidate.findByIdAndUpdate(id, { connected: true }, { returnDocument: 'after' });
      }
      if (!candidate) {
        // Match by name or stripped name (e.g. 'priyam-1' -> 'priyam')
        const namePart = id.split('-')[0];
        candidate = await Candidate.findOneAndUpdate(
          { $or: [{ name: new RegExp(`^${id}$`, 'i') }, { name: new RegExp(`^${namePart}$`, 'i') }] },
          { connected: true },
          { returnDocument: 'after' }
        );
      }
    } else {
      candidate = memCandidates.find(c => c.id === id || c._id === id || c.name.toLowerCase() === id.toLowerCase() || c.id.startsWith(id));
      if (candidate) candidate.connected = true;
    }

    if (!candidate) {
      return res.status(404).json({ success: false, message: `Candidate "${id}" not found.` });
    }

    res.status(200).json({
      success: true,
      message: `Invitation sent to ${candidate.name}!`,
      candidateName: candidate.name,
      role: role || candidate.roleTag || 'Project Contributor',
      inviteMessage: message || '',
      candidate
    });
  } catch (err) {
    console.error('Error in /api/candidates/:id/connect:', err);
    res.status(500).json({ success: false, message: 'Failed to connect with candidate.' });
  }
});

/**
 * POST /api/invitations (Backward Compatibility)
 */
app.post('/api/invitations', async (req, res) => {
  const { candidateId, role, message } = req.body;
  if (!candidateId) {
    return res.status(400).json({ success: false, message: 'candidateId is required' });
  }
  req.params = { id: candidateId };
  return app._router.handle(req, res);
});

// -----------------------------------------------------------------------------
// 4. GROUPS / HACKATHON TEAMS REST API ROUTES
// -----------------------------------------------------------------------------

/**
 * GET /api/groups
 * Fetch all active hackathon groups from MongoDB
 */
app.get('/api/groups', async (req, res) => {
  try {
    if (isMongoConnected) {
      const groups = await Group.find().sort({ createdAt: -1 });
      return res.json(groups);
    } else {
      return res.json(memGroups);
    }
  } catch (err) {
    console.error('Error in GET /api/groups:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve groups.' });
  }
});

/**
 * POST /api/groups
 * Create a new group (Only enabled after a user profile exists / authenticated)
 */
app.post('/api/groups', async (req, res) => {
  try {
    const { name, seeking, project, maxMembers, leaderId, leaderName, tags } = req.body;

    if (!name || !name.trim() || !seeking || !seeking.trim() || !project || !project.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Team Name, Seeking Role, and Project Pitch are all required.'
      });
    }

    let parsedTags = [];
    if (Array.isArray(tags)) {
      parsedTags = tags.map(t => String(t).trim()).filter(Boolean);
    } else if (typeof tags === 'string') {
      parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
    }

    const groupData = {
      name: name.trim(),
      leaderId: leaderId || 'anonymous-lead',
      seeking: seeking.trim(),
      project: project.trim(),
      membersCount: 1,
      maxMembers: Number(maxMembers) || 4,
      members: [leaderName || 'Team Lead (Founder)'],
      tags: parsedTags,
      applied: false,
      applicants: [],
      createdAt: new Date()
    };

    if (isMongoConnected) {
      const newGroup = new Group(groupData);
      await newGroup.save();
      return res.status(201).json({
        success: true,
        message: `Team "${newGroup.name}" published! Now discoverable by builders.`,
        group: newGroup
      });
    } else {
      const newGroup = {
        id: `group-${Date.now()}`,
        _id: `group-${Date.now()}`,
        ...groupData
      };
      memGroups.unshift(newGroup);
      return res.status(201).json({
        success: true,
        message: `Team "${newGroup.name}" published! Now discoverable by builders.`,
        group: newGroup
      });
    }
  } catch (err) {
    console.error('Error in POST /api/groups:', err);
    res.status(500).json({ success: false, message: 'Failed to create new team.' });
  }
});

/**
 * POST /api/groups/:id/join
 * Add applicant to team and increment membersCount
 */
app.post('/api/groups/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const { candidateId, candidateName, note } = req.body;

    let group = null;

    if (isMongoConnected) {
      if (mongoose.Types.ObjectId.isValid(id)) {
        group = await Group.findById(id);
      }
      if (!group) {
        // Match by regex name or slug
        const cleanName = id.replace(/-/g, ' ');
        group = await Group.findOne({
          $or: [
            { name: new RegExp(`^${id}$`, 'i') },
            { name: new RegExp(id, 'i') },
            { name: new RegExp(cleanName, 'i') }
          ]
        });
      }

      if (!group) {
        return res.status(404).json({ success: false, message: `Group "${id}" not found.` });
      }

      group.applied = true;
      group.applicants.push({
        candidateId: candidateId || 'applicant',
        candidateName: candidateName || 'Quiet Builder',
        note: note || '',
        appliedAt: new Date()
      });

      // Increment member count if below max
      if (group.membersCount < group.maxMembers) {
        group.membersCount += 1;
        group.members.push(candidateName || 'New Teammate');
      }

      await group.save();
      return res.status(200).json({
        success: true,
        message: `Application sent to ${group.name} leads! Successfully submitted proof-of-work.`,
        group
      });
    } else {
      group = memGroups.find(g => g.id === id || g._id === id || g.name.toLowerCase() === id.toLowerCase() || g.name.toLowerCase().includes(id.toLowerCase()));
      if (!group) {
        return res.status(404).json({ success: false, message: `Group "${id}" not found.` });
      }

      group.applied = true;
      group.applicants.push({
        candidateId: candidateId || 'applicant',
        candidateName: candidateName || 'Quiet Builder',
        note: note || '',
        appliedAt: new Date()
      });
      if (group.membersCount < group.maxMembers) {
        group.membersCount += 1;
        group.members.push(candidateName || 'New Teammate');
      }

      return res.status(200).json({
        success: true,
        message: `Application sent to ${group.name} leads! Successfully submitted proof-of-work.`,
        group
      });
    }
  } catch (err) {
    console.error('Error in POST /api/groups/:id/join:', err);
    res.status(500).json({ success: false, message: 'Failed to join group.' });
  }
});

// -----------------------------------------------------------------------------
// 5. AI MATCHING HOOK (RESERVED FOR GEMINI API)
// -----------------------------------------------------------------------------

/**
 * POST /api/ai/match
 * Accepts { requirementText }. Uses GEMINI_API_KEY to parse requirements,
 * extract skills, and query MongoDB for the top 3 best-fitting candidates.
 */
app.post('/api/ai/match', async (req, res) => {
  try {
    const { requirementText } = req.body;

    if (!requirementText || !requirementText.trim()) {
      return res.status(400).json({
        success: false,
        message: 'requirementText is required for AI candidate matching.'
      });
    }

    let extractedSkills = [];
    let extractedRole = '';
    let aiSummary = '';

    // Check if live GEMINI_API_KEY is configured
    const isLiveGeminiKey = GEMINI_API_KEY && !GEMINI_API_KEY.includes('your_gemini_api_key');

    if (isLiveGeminiKey) {
      try {
        const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const prompt = `You are an expert talent scout for Kindred, matching quiet technical builders to teams.
Analyze this user requirement:
"${requirementText}"

Extract:
1. Target role / title
2. Technical skill keywords (e.g. C++, React, DSA, Rust, Python, Go, Next.js)
3. A 1-sentence match rationale.

Respond strictly with a JSON object in this exact format:
{
  "role": "extracted role",
  "skills": ["skill1", "skill2"],
  "summary": "Match rationale"
}`;

        const geminiResponse = await fetch(geminiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });

        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json();
          const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (responseText) {
            const parsed = JSON.parse(responseText);
            extractedSkills = parsed.skills || [];
            extractedRole = parsed.role || '';
            aiSummary = parsed.summary || '';
          }
        }
      } catch (geminiErr) {
        console.warn('[Gemini API Notice] AI call skipped or failed, fallback to local NLP:', geminiErr.message);
      }
    }

    // Intelligent local NLP fallback if Gemini key is placeholder or request completed
    if (extractedSkills.length === 0) {
      const knownSkills = ['C++', 'DSA', 'Backend', 'React', 'Tailwind', 'Rust', 'Go', 'Python', 'PyTorch', 'Next.js', 'Node.js', 'PostgreSQL', 'Docker', 'FastAPI', 'Algorithms', 'LeetCode'];
      const textLower = requirementText.toLowerCase();
      extractedSkills = knownSkills.filter(skill => textLower.includes(skill.toLowerCase()));
      if (extractedSkills.length === 0) {
        extractedSkills = requirementText.split(/\s+/).slice(0, 3);
      }
      aiSummary = `Matched using semantic keyword extraction for skills: ${extractedSkills.join(', ')}`;
    }

    // Query candidates matching extracted skills or roles
    let allCandidates = [];
    if (isMongoConnected) {
      allCandidates = await Candidate.find();
    } else {
      allCandidates = memCandidates;
    }

    // Score candidates based on skill & keyword overlap
    const scored = allCandidates.map(c => {
      let score = 0;
      const cSkills = (c.skills || []).map(s => s.toLowerCase());
      const cCorpus = `${c.name} ${c.roleTag} ${c.proofOfWork} ${cSkills.join(' ')}`.toLowerCase();

      extractedSkills.forEach(skill => {
        const sLower = skill.toLowerCase();
        if (cSkills.some(cs => cs.includes(sLower) || sLower.includes(cs))) score += 3;
        else if (cCorpus.includes(sLower)) score += 1;
      });

      if (extractedRole && c.roleTag.toLowerCase().includes(extractedRole.toLowerCase())) {
        score += 2;
      }

      return { candidate: c, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const top3 = scored.slice(0, 3).map(s => s.candidate);

    return res.status(200).json({
      success: true,
      requirementText,
      extractedRole,
      extractedSkills,
      aiSummary,
      candidates: top3
    });
  } catch (err) {
    console.error('Error in /api/ai/match:', err);
    res.status(500).json({ success: false, message: 'AI matching service error.' });
  }
});

// -----------------------------------------------------------------------------
// 6. HEALTH & DIAGNOSTIC ENDPOINT
// -----------------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  let candidatesCount = 0;
  let groupsCount = 0;
  let usersCount = 0;

  if (isMongoConnected) {
    candidatesCount = await Candidate.countDocuments();
    groupsCount = await Group.countDocuments();
    usersCount = await User.countDocuments();
  } else {
    candidatesCount = memCandidates.length;
    groupsCount = memGroups.length;
    usersCount = memUsers.length;
  }

  res.json({
    status: 'ok',
    database: isMongoConnected ? 'MongoDB (connected)' : 'In-Memory (resilient fallback)',
    candidatesCount,
    groupsCount,
    usersCount,
    geminiConfigured: Boolean(GEMINI_API_KEY && !GEMINI_API_KEY.includes('your_gemini_api_key')),
    timestamp: new Date().toISOString()
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Talent Bridge Backend running on http://localhost:${PORT}`);
});
