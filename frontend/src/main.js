import './style.css';
import { initDotMatrixCanvas } from './canvas.js';

/**
 * TalentBridge Client-Side Controller & State Management
 * Extends the system with:
 * 1. "Create Your Profile" modal & live candidate persistence
 * 2. Resume file handling with preview
 * 3. Group & Team Matchmaking Board (Hyperfusion 2K26, Web3 Builders, AI Research Pod)
 * 4. Shared connection & application state synced with localStorage & Express backend
 * 5. Real-time debounced search & Web Speech API integration
 */

const API_BASE = 'http://localhost:5000/api';
const STORAGE_KEYS = {
  CANDIDATES: 'talentbridge_candidates',
  GROUPS: 'talentbridge_groups',
  CONNECTIONS: 'talentbridge_connections',
  APPLICATIONS: 'talentbridge_applications',
  USER_PROFILE: 'talentbridge_user_profile'
};

// Initial Mock Candidates (used as initial seed if localStorage or API is empty)
const INITIAL_CANDIDATES = [
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
    connected: false
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
    connected: false
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
    connected: false
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
    connected: false
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
    connected: false
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
    connected: false
  }
];

// Initial Developer Groups & Hackathon Teams
const INITIAL_GROUPS = [
  {
    id: 'team-alpha',
    name: 'Team Alpha (Hyperfusion 2K26)',
    seeking: '1 C++ / Systems Builder',
    project: 'Low-latency streaming platform',
    currentMembers: 3,
    maxMembers: 4,
    tags: ['C++', 'Low-Latency', 'Systems', 'Distributed Systems'],
    applied: false
  },
  {
    id: 'web3-builders',
    name: 'Web3 Builders',
    seeking: '1 Frontend UI dev (React/Tailwind)',
    project: 'Decentralized identity portal',
    currentMembers: 2,
    maxMembers: 4,
    tags: ['React', 'Tailwind UI', 'TypeScript', 'Web3'],
    applied: false
  },
  {
    id: 'ai-research-pod',
    name: 'AI Research Pod',
    seeking: '1 Python / ML Engineer',
    project: 'Computer Vision sign language detector',
    currentMembers: 3,
    maxMembers: 4,
    tags: ['Python', 'PyTorch', 'Computer Vision', 'FastAPI'],
    applied: false
  }
];

class TalentBridgeApp {
  constructor() {
    this.candidates = [];
    this.groups = [];
    this.searchQuery = '';
    this.selectedCandidateId = null;
    this.selectedResumeFile = null;
    this.formPayload = {
      role: 'Backend C++ Developer',
      message: ''
    };
    this.isListening = false;
    this.speechRecognition = null;
    this.speechLang = 'en-US';
    this.searchDebounceTimer = null;

    this.initDOM();
    this.initSpeechRecognition();
    this.loadPersistedState();
    this.bindEvents();
    this.syncWithBackend();
  }

  initDOM() {
    this.dom = {
      // Search elements
      searchInput: document.getElementById('candidateSearchInput'),
      searchBar: document.getElementById('heroSearchBar'),
      clearInputBtn: document.getElementById('clearInputBtn'),
      searchSubmitBtn: document.getElementById('searchSubmitBtn'),
      voiceMicBtn: document.getElementById('voiceMicBtn'),
      voiceFeedback: document.getElementById('voiceFeedback'),
      candidatesGrid: document.getElementById('candidatesGrid'),
      resultsStatusText: document.getElementById('resultsStatusText'),
      emptyStateView: document.getElementById('emptyStateView'),
      emptyQueryDisplay: document.getElementById('emptyQueryDisplay'),
      resetSearchBtn: document.getElementById('resetSearchBtn'),
      filterChips: document.querySelectorAll('.filter-chip'),
      mainCtaBtn: document.getElementById('mainCtaBtn'),
      
      // Groups elements
      groupsGrid: document.getElementById('groupsGrid'),

      // Invite Modal
      inviteModalOverlay: document.getElementById('inviteModalOverlay'),
      modalHeading: document.getElementById('modalHeading'),
      modalCandidateBadge: document.getElementById('modalCandidateBadge'),
      modalCandidateAvatar: document.getElementById('modalCandidateAvatar'),
      modalCandidateName: document.getElementById('modalCandidateName'),
      modalCandidateSub: document.getElementById('modalCandidateSub'),
      inviteRoleSelect: document.getElementById('inviteRoleSelect'),
      inviteMessageInput: document.getElementById('inviteMessageInput'),
      inviteForm: document.getElementById('inviteForm'),
      closeInviteModalBtn: document.getElementById('closeModalBtn'),
      cancelInviteModalBtn: document.getElementById('cancelModalBtn'),
      submitInviteBtn: document.getElementById('submitInviteBtn'),

      // Create Profile Modal
      createProfileModalOverlay: document.getElementById('createProfileModalOverlay'),
      openCreateProfileNavBtn: document.getElementById('openCreateProfileNavBtn'),
      openCreateProfileHeroBtn: document.getElementById('openCreateProfileHeroBtn'),
      closeCreateProfileModalBtn: document.getElementById('closeCreateProfileModalBtn'),
      cancelCreateProfileBtn: document.getElementById('cancelCreateProfileBtn'),
      createProfileForm: document.getElementById('createProfileForm'),
      profNameInput: document.getElementById('profNameInput'),
      profRoleTagInput: document.getElementById('profRoleTagInput'),
      profSkillsInput: document.getElementById('profSkillsInput'),
      profProofInput: document.getElementById('profProofInput'),
      profAvailabilitySelect: document.getElementById('profAvailabilitySelect'),
      profGithubInput: document.getElementById('profGithubInput'),
      profPortfolioInput: document.getElementById('profPortfolioInput'),
      resumeFileInput: document.getElementById('resumeFileInput'),
      resumeDropzone: document.getElementById('resumeDropzone'),
      resumePreviewWrap: document.getElementById('resumePreviewWrap'),
      resumeFileNameSpan: document.getElementById('resumeFileNameSpan'),
      removeResumeBtn: document.getElementById('removeResumeBtn'),

      // Toast Tray
      toastTray: document.getElementById('toastTray')
    };
  }

  /**
   * Load state from localStorage on startup (instant load)
   */
  loadPersistedState() {
    try {
      const savedCandidates = localStorage.getItem(STORAGE_KEYS.CANDIDATES);
      if (savedCandidates) {
        this.candidates = JSON.parse(savedCandidates);
      } else {
        this.candidates = JSON.parse(JSON.stringify(INITIAL_CANDIDATES));
      }

      const savedGroups = localStorage.getItem(STORAGE_KEYS.GROUPS);
      if (savedGroups) {
        this.groups = JSON.parse(savedGroups);
      } else {
        this.groups = JSON.parse(JSON.stringify(INITIAL_GROUPS));
      }

      // Re-apply connection overrides from localStorage
      const savedConnections = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONNECTIONS) || '{}');
      this.candidates.forEach(c => {
        if (savedConnections[c.id]) {
          c.connected = true;
        }
      });

      // Re-apply group applications from localStorage
      const savedApps = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '{}');
      this.groups.forEach(g => {
        if (savedApps[g.id]) {
          g.applied = true;
        }
      });
    } catch (e) {
      console.warn('Error reading from localStorage:', e);
      this.candidates = JSON.parse(JSON.stringify(INITIAL_CANDIDATES));
      this.groups = JSON.parse(JSON.stringify(INITIAL_GROUPS));
    }

    this.renderCandidates();
    this.renderGroups();
  }

  /**
   * Save current state to localStorage
   */
  saveStateToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.CANDIDATES, JSON.stringify(this.candidates));
      localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(this.groups));

      const connections = {};
      this.candidates.forEach(c => {
        if (c.connected) connections[c.id] = true;
      });
      localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify(connections));

      const applications = {};
      this.groups.forEach(g => {
        if (g.applied) applications[g.id] = true;
      });
      localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(applications));
    } catch (e) {
      console.warn('Error saving state to localStorage:', e);
    }
  }

  /**
   * Synchronize candidates and groups with the Express backend
   */
  async syncWithBackend() {
    try {
      // 1. Fetch Candidates from backend
      const candRes = await fetch(`${API_BASE}/candidates`);
      if (candRes.ok) {
        const backendCandidates = await candRes.json();
        if (Array.isArray(backendCandidates) && backendCandidates.length > 0) {
          // Merge with local newly created candidates
          const localOnly = this.candidates.filter(
            lc => !backendCandidates.some(bc => bc.id === lc.id)
          );
          this.candidates = [...localOnly, ...backendCandidates];

          // Preserve connected states
          const savedConnections = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONNECTIONS) || '{}');
          this.candidates.forEach(c => {
            if (savedConnections[c.id]) c.connected = true;
          });

          this.saveStateToStorage();
          this.renderCandidates();
        }
      }

      // 2. Fetch Groups from backend
      const groupRes = await fetch(`${API_BASE}/groups`);
      if (groupRes.ok) {
        const backendGroups = await groupRes.json();
        if (Array.isArray(backendGroups) && backendGroups.length > 0) {
          this.groups = backendGroups;
          const savedApps = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '{}');
          this.groups.forEach(g => {
            if (savedApps[g.id]) g.applied = true;
          });
          this.saveStateToStorage();
          this.renderGroups();
        }
      }
    } catch (err) {
      console.info('Backend API unavailable; running in offline/localStorage mode.');
    }
  }

  /**
   * Search and filter candidates
   */
  filterCandidates(query = '') {
    const q = (query || '').trim().toLowerCase();
    if (!q) return this.candidates;

    const tokens = q.split(/\s+/).filter(Boolean);

    return this.candidates.filter(c => {
      const name = (c.name || '').toLowerCase();
      const skills = (c.skills || []).map(s => String(s).toLowerCase());
      const pow = (c.proofOfWork || '').toLowerCase();
      const role = (c.roleTag || '').toLowerCase();
      const corpus = `${name} ${skills.join(' ')} ${pow} ${role}`;

      if (corpus.includes(q)) return true;
      if (name.includes(q)) return true;
      if (skills.some(s => s.includes(q) || q.includes(s))) return true;
      if (pow.includes(q)) return true;
      if (tokens.every(t => corpus.includes(t))) return true;
      return tokens.some(t => name.includes(t) || skills.some(s => s.includes(t)) || pow.includes(t));
    });
  }

  /**
   * Debounced search handler for live keystrokes & speech input
   */
  handleSearchInput(value, immediate = false) {
    this.searchQuery = value;
    this.dom.searchInput.value = value;

    if (value) {
      this.dom.clearInputBtn.style.display = 'inline-flex';
    } else {
      this.dom.clearInputBtn.style.display = 'none';
    }

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    if (immediate) {
      this.renderCandidates();
    } else {
      this.searchDebounceTimer = setTimeout(() => {
        this.renderCandidates();
      }, 200);
    }
  }

  /**
   * Native Web Speech API Integration
   */
  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.continuous = false;
      this.speechRecognition.interimResults = true;
      this.speechRecognition.lang = this.speechLang;

      this.speechRecognition.onstart = () => {
        this.isListening = true;
        this.updateVoiceUI(true, 'Listening... speak skill or role');
      };

      this.speechRecognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }

        const cleanTranscript = transcript.trim();
        if (cleanTranscript) {
          this.handleSearchInput(cleanTranscript, true);
          this.updateVoiceUI(true, `Heard: "${cleanTranscript}"`);
        }
      };

      this.speechRecognition.onerror = (event) => {
        if (event.error === 'language-not-supported' && this.speechLang !== 'en-IN') {
          this.speechLang = 'en-IN';
          this.speechRecognition.lang = 'en-IN';
          try {
            this.speechRecognition.start();
            return;
          } catch (e) {}
        }

        if (event.error === 'not-allowed') {
          this.showToast('Microphone Denied', 'Please allow microphone access to search by voice.', 'error');
        } else if (event.error !== 'no-speech') {
          this.showToast('Voice Search Error', `Error: ${event.error}`, 'error');
        }

        this.stopListening();
      };

      this.speechRecognition.onend = () => {
        this.stopListening();
      };
    } catch (err) {
      console.warn('SpeechRecognition initialization error:', err);
    }
  }

  startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.showToast('Speech Recognition Unsupported', 'Web Speech API is not supported in this browser.', 'error');
      return;
    }

    if (this.isListening) {
      this.stopListening();
      return;
    }

    try {
      if (!this.speechRecognition) {
        this.initSpeechRecognition();
      }
      this.speechRecognition.start();
    } catch (e) {
      this.stopListening();
    }
  }

  stopListening() {
    this.isListening = false;
    if (this.speechRecognition) {
      try {
        this.speechRecognition.stop();
      } catch (e) {}
    }
    this.updateVoiceUI(false, '');
  }

  updateVoiceUI(active, text) {
    if (active) {
      this.dom.voiceMicBtn.classList.add('listening');
      this.dom.searchBar.classList.add('is-listening');
      this.dom.voiceFeedback.textContent = text || 'Listening...';
      this.dom.voiceFeedback.classList.add('active');
    } else {
      this.dom.voiceMicBtn.classList.remove('listening');
      this.dom.searchBar.classList.remove('is-listening');
      this.dom.voiceFeedback.textContent = '';
      this.dom.voiceFeedback.classList.remove('active');
    }
  }

  /**
   * 1. CREATE PROFILE MODAL & CANDIDATE PERSISTENCE
   */
  openCreateProfileModal() {
    this.dom.createProfileModalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      this.dom.profNameInput.focus();
    }, 100);
  }

  closeCreateProfileModal() {
    this.dom.createProfileModalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  handleResumeFileSelection(file) {
    if (!file) return;

    const validExtensions = ['.pdf', '.docx', '.doc'];
    const fileName = file.name;
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

    if (!validExtensions.includes(ext)) {
      this.showToast('Invalid File Type', 'Please upload a .pdf or .docx resume file.', 'error');
      return;
    }

    this.selectedResumeFile = file;
    this.dom.resumeFileNameSpan.textContent = `${fileName} (${(file.size / 1024).toFixed(1)} KB)`;
    this.dom.resumePreviewWrap.style.display = 'inline-flex';
  }

  clearResumeFile() {
    this.selectedResumeFile = null;
    this.dom.resumeFileInput.value = '';
    this.dom.resumeFileNameSpan.textContent = '';
    this.dom.resumePreviewWrap.style.display = 'none';
  }

  async handleCreateProfileSubmit(e) {
    e.preventDefault();

    const name = this.dom.profNameInput.value.trim();
    if (!name) {
      this.showToast('Name Required', 'Please enter your full name or developer handle.', 'error');
      this.dom.profNameInput.focus();
      return;
    }

    const roleTag = this.dom.profRoleTagInput.value.trim() || 'Quiet Builder / Engineer';
    const skillsRaw = this.dom.profSkillsInput.value.trim();
    const skills = skillsRaw
      ? skillsRaw.split(',').map(s => s.trim()).filter(Boolean)
      : ['Problem Solving', 'Software Engineering'];

    const proofOfWork = this.dom.profProofInput.value.trim() || 'Verified Autonomous Project Builder';
    const availability = this.dom.profAvailabilitySelect.value || 'Open to Hackathon Teams & Dev Groups';
    const github = this.dom.profGithubInput.value.trim();
    const portfolio = this.dom.profPortfolioInput.value.trim();

    const resumeFileName = this.selectedResumeFile ? this.selectedResumeFile.name : '';

    const newCandidate = {
      id: `cand-${Date.now()}`,
      name,
      roleTag,
      skills,
      proofOfWork,
      availability,
      resumeFileName,
      github,
      portfolio,
      connected: false,
      createdAt: new Date().toISOString()
    };

    // 1. Add to beginning of active candidate store
    this.candidates.unshift(newCandidate);
    this.saveStateToStorage();

    // 2. Also persist to Express backend if online
    try {
      fetch(`${API_BASE}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCandidate)
      }).catch(err => console.info('Backend candidate sync offline:', err));
    } catch (e) {}

    // 3. Reset form & close modal
    this.dom.createProfileForm.reset();
    this.clearResumeFile();
    this.closeCreateProfileModal();

    // 4. Update the candidate grid and scroll to discovery
    this.renderCandidates();
    document.getElementById('discovery').scrollIntoView({ behavior: 'smooth' });

    // 5. Emit confirmation toast
    this.showToast(
      'Profile published successfully!',
      'Your proof-of-work is now discoverable by recruiters and teams.',
      'success'
    );
  }

  /**
   * 2. GROUP & TEAM MATCHMAKING BOARD
   */
  async joinGroup(groupId) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;

    // Check if already applied
    if (group.applied) {
      this.showToast('Already Applied', `You have already submitted an application to ${group.name}.`, 'info');
      return;
    }

    // Set applied status
    group.applied = true;
    if (group.currentMembers < group.maxMembers) {
      group.currentMembers += 1;
    }
    this.saveStateToStorage();
    this.renderGroups();

    // Try posting to Express backend
    try {
      fetch(`${API_BASE}/groups/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          candidateName: 'Quiet Builder',
          note: 'Applied with verified proof-of-work'
        })
      }).catch(err => console.info('Backend group join sync offline:', err));
    } catch (e) {}

    // Emit confirmation toast
    this.showToast(
      `Application sent to ${group.name} leads!`,
      `Seeking: ${group.seeking}. Your proof-of-work has been shared with the team.`,
      'success'
    );
  }

  /**
   * 3. INVITATION HANDSHAKE MODAL
   */
  openInviteModal(candidateId) {
    const candidate = this.candidates.find(c => c.id === candidateId);
    if (!candidate) return;

    this.selectedCandidateId = candidateId;
    this.formPayload = {
      role: 'Backend C++ Developer',
      message: ''
    };

    // Update Modal DOM
    this.dom.modalHeading.textContent = `Send Invitation to ${candidate.name}`;
    this.dom.modalCandidateAvatar.textContent = candidate.name.charAt(0);
    this.dom.modalCandidateName.textContent = candidate.name;
    this.dom.modalCandidateSub.textContent = `${(candidate.skills || []).slice(0, 3).join(', ')} • ${candidate.proofOfWork}`;

    this.dom.inviteRoleSelect.value = 'Backend C++ Developer';
    this.dom.inviteMessageInput.value = '';

    this.dom.inviteModalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      this.dom.inviteRoleSelect.focus();
    }, 100);
  }

  closeInviteModal() {
    this.selectedCandidateId = null;
    this.dom.inviteModalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  async sendInvite(candidateId, role, message = '') {
    const targetId = candidateId || this.selectedCandidateId;
    const candidate = this.candidates.find(c => c.id === targetId);
    if (!candidate) return;

    const assignedRole = role || this.formPayload.role || 'Backend C++ Developer';

    // Mark connected state and persist
    candidate.connected = true;
    this.saveStateToStorage();

    // Close modal
    this.closeInviteModal();

    // Re-render candidates
    this.renderCandidates();

    // Post to backend
    try {
      fetch(`${API_BASE}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: targetId,
          role: assignedRole,
          message: message || ''
        })
      }).catch(err => console.info('Backend invitation offline:', err));
    } catch (e) {}

    // Emit success toast
    this.showToast(
      `Invitation sent to ${candidate.name}!`,
      `Role: ${assignedRole}. Successfully linked to developer group.`,
      'success'
    );
  }

  /**
   * Render candidate cards into grid
   */
  renderCandidates() {
    const filtered = this.filterCandidates(this.searchQuery);
    const count = filtered.length;
    const currentQuery = (this.searchQuery || '').trim().toLowerCase();

    // Update status bar
    if (currentQuery) {
      this.dom.resultsStatusText.innerHTML = `Found <strong>${count}</strong> candidate${count === 1 ? '' : 's'} matching "<strong>${escapeHTML(this.searchQuery)}</strong>"`;
    } else {
      this.dom.resultsStatusText.innerHTML = `Showing all <strong>${this.candidates.length}</strong> quiet builders`;
    }

    // Update filter chips
    this.dom.filterChips.forEach(chip => {
      const val = chip.getAttribute('data-filter') || '';
      if (val.toLowerCase() === currentQuery) {
        chip.classList.add('active');
      } else if (!currentQuery && val === '') {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });

    // Empty state
    if (count === 0) {
      this.dom.candidatesGrid.style.display = 'none';
      this.dom.emptyStateView.style.display = 'block';
      this.dom.emptyQueryDisplay.textContent = this.searchQuery;
      return;
    }

    this.dom.candidatesGrid.style.display = 'grid';
    this.dom.emptyStateView.style.display = 'none';

    // Render Cards
    this.dom.candidatesGrid.innerHTML = filtered.map(c => {
      const isMatch = (term) => currentQuery && term.toLowerCase().includes(currentQuery);

      const skillsHTML = (c.skills || []).map(skill => {
        const highlighted = isMatch(skill) ? 'match-highlight' : '';
        return `<span class="skill-pill ${highlighted}">${escapeHTML(skill)}</span>`;
      }).join('');

      // Meta Links (Resume badge, GitHub, Portfolio)
      let metaLinksHTML = '';
      if (c.resumeFileName) {
        metaLinksHTML += `
          <span class="meta-link-pill" title="Resume on file">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>Resume</span>
          </span>
        `;
      }
      if (c.github) {
        metaLinksHTML += `
          <a href="${escapeHTML(c.github)}" target="_blank" rel="noopener noreferrer" class="meta-link-pill">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            <span>GitHub</span>
          </a>
        `;
      }
      if (c.portfolio) {
        metaLinksHTML += `
          <a href="${escapeHTML(c.portfolio)}" target="_blank" rel="noopener noreferrer" class="meta-link-pill">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span>Portfolio</span>
          </a>
        `;
      }

      const connectedBtnHTML = c.connected
        ? `<button type="button" class="btn-invite-team is-connected" disabled>
             <svg viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
             <span>Invited ✓</span>
           </button>`
        : `<button type="button" class="btn-invite-team" onclick="window.talentMatcher.openInviteModal('${c.id}')">
             <span>Invite to Team</span>
           </button>`;

      return `
        <div class="candidate-card" data-id="${c.id}">
          <div class="card-top">
            <div class="candidate-profile">
              <div class="candidate-avatar">${escapeHTML(c.name.charAt(0))}</div>
              <div>
                <h3 class="candidate-name">${escapeHTML(c.name)}</h3>
                <span class="candidate-role-tag">${escapeHTML(c.roleTag)}</span>
              </div>
            </div>
            <span class="availability-pill">
              <span class="dot-live"></span>
              <span>Available</span>
            </span>
          </div>

          <div class="card-middle">
            <div class="skills-pills">
              ${skillsHTML}
            </div>

            <div class="pow-box">
              <svg class="pow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
              <span>${escapeHTML(c.proofOfWork)}</span>
            </div>

            ${metaLinksHTML ? `<div class="candidate-meta-links">${metaLinksHTML}</div>` : ''}

            <div class="availability-text">
              ${escapeHTML(c.availability)}
            </div>
          </div>

          <div class="card-bottom">
            ${connectedBtnHTML}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render groups board
   */
  renderGroups() {
    if (!this.dom.groupsGrid) return;

    this.dom.groupsGrid.innerHTML = this.groups.map(g => {
      const dotsHTML = Array.from({ length: g.maxMembers }, (_, i) => {
        const isFilled = i < g.currentMembers;
        return `<span class="capacity-dot ${isFilled ? 'filled' : ''}"></span>`;
      }).join('');

      const tagsHTML = (g.tags || []).map(t => `<span class="group-tag">${escapeHTML(t)}</span>`).join('');

      const buttonHTML = g.applied
        ? `<button type="button" class="btn-join-group is-applied" disabled>
             <svg viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
             <span>Application Sent ✓</span>
           </button>`
        : `<button type="button" class="btn-join-group" onclick="window.talentMatcher.joinGroup('${g.id}')">
             <span>Join Group / Apply with Proof-of-Work</span>
           </button>`;

      return `
        <div class="group-card" data-id="${g.id}">
          <div>
            <div class="group-top">
              <h3 class="group-name">${escapeHTML(g.name)}</h3>
              <span class="group-status-pill">Recruiting: 1 Spot Left</span>
            </div>

            <p class="group-project-desc">${escapeHTML(g.project)}</p>

            <div class="group-seeking-box">
              <span class="seeking-label">Seeking Role</span>
              <div class="seeking-role">${escapeHTML(g.seeking)}</div>
            </div>

            <div class="group-capacity-row">
              <span>Team Roster (${g.currentMembers}/${g.maxMembers})</span>
              <div class="capacity-dots">${dotsHTML}</div>
            </div>

            <div class="group-tags">
              ${tagsHTML}
            </div>
          </div>

          <div>
            ${buttonHTML}
          </div>
        </div>
      `;
    }).join('');
  }

  showToast(title, message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;

    let iconSVG = '';
    if (type === 'success') {
      iconSVG = `<svg viewBox="0 0 20 20" fill="currentColor">
                   <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                 </svg>`;
    } else if (type === 'error') {
      iconSVG = `<svg viewBox="0 0 20 20" fill="currentColor">
                   <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                 </svg>`;
    } else {
      iconSVG = `<svg viewBox="0 0 20 20" fill="currentColor">
                   <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                 </svg>`;
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSVG}</div>
      <div class="toast-text">
        <div class="toast-title">${escapeHTML(title)}</div>
        <div class="toast-detail">${escapeHTML(message)}</div>
      </div>
      <button type="button" class="toast-close-x" aria-label="Close notification">✕</button>
    `;

    const closeBtn = toast.querySelector('.toast-close-x');
    closeBtn.addEventListener('click', () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 250);
    });

    this.dom.toastTray.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 250);
      }
    }, 4500);
  }

  bindEvents() {
    // Search input
    this.dom.searchInput.addEventListener('input', (e) => {
      this.handleSearchInput(e.target.value);
    });

    // Enter key scrolls down to discovery
    this.dom.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('discovery').scrollIntoView({ behavior: 'smooth' });
      }
    });

    this.dom.searchSubmitBtn.addEventListener('click', () => {
      document.getElementById('discovery').scrollIntoView({ behavior: 'smooth' });
    });

    this.dom.clearInputBtn.addEventListener('click', () => {
      this.handleSearchInput('', true);
      this.dom.searchInput.focus();
    });

    this.dom.resetSearchBtn.addEventListener('click', () => {
      this.handleSearchInput('', true);
      this.dom.searchInput.focus();
    });

    // Voice search mic button
    this.dom.voiceMicBtn.addEventListener('click', () => {
      if (this.isListening) {
        this.stopListening();
      } else {
        this.startListening();
      }
    });

    // Filter Chips
    this.dom.filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const filter = chip.getAttribute('data-filter') || '';
        this.handleSearchInput(filter, true);
        document.getElementById('discovery').scrollIntoView({ behavior: 'smooth' });
      });
    });

    // CTA Button smooth scroll
    this.dom.mainCtaBtn.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('discovery').scrollIntoView({ behavior: 'smooth' });
    });

    // Invite Modal close listeners
    this.dom.closeInviteModalBtn.addEventListener('click', () => this.closeInviteModal());
    this.dom.cancelInviteModalBtn.addEventListener('click', () => this.closeInviteModal());
    this.dom.inviteModalOverlay.addEventListener('click', (e) => {
      if (e.target === this.dom.inviteModalOverlay) this.closeInviteModal();
    });

    // Invite Form Submit
    this.dom.inviteForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const role = this.dom.inviteRoleSelect.value;
      const msg = this.dom.inviteMessageInput.value;
      this.sendInvite(this.selectedCandidateId, role, msg);
    });

    this.dom.inviteRoleSelect.addEventListener('change', (e) => {
      this.formPayload.role = e.target.value;
    });

    // Create Profile Modal triggers
    if (this.dom.openCreateProfileNavBtn) {
      this.dom.openCreateProfileNavBtn.addEventListener('click', () => this.openCreateProfileModal());
    }
    if (this.dom.openCreateProfileHeroBtn) {
      this.dom.openCreateProfileHeroBtn.addEventListener('click', () => this.openCreateProfileModal());
    }
    if (this.dom.closeCreateProfileModalBtn) {
      this.dom.closeCreateProfileModalBtn.addEventListener('click', () => this.closeCreateProfileModal());
    }
    if (this.dom.cancelCreateProfileBtn) {
      this.dom.cancelCreateProfileBtn.addEventListener('click', () => this.closeCreateProfileModal());
    }
    if (this.dom.createProfileModalOverlay) {
      this.dom.createProfileModalOverlay.addEventListener('click', (e) => {
        if (e.target === this.dom.createProfileModalOverlay) this.closeCreateProfileModal();
      });
    }

    // Resume File Input change
    if (this.dom.resumeFileInput) {
      this.dom.resumeFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleResumeFileSelection(e.target.files[0]);
        }
      });
    }

    // Remove resume button
    if (this.dom.removeResumeBtn) {
      this.dom.removeResumeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearResumeFile();
      });
    }

    // Create Profile Form Submit
    if (this.dom.createProfileForm) {
      this.dom.createProfileForm.addEventListener('submit', (e) => {
        this.handleCreateProfileSubmit(e);
      });
    }

    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.dom.inviteModalOverlay.classList.contains('active')) {
          this.closeInviteModal();
        }
        if (this.dom.createProfileModalOverlay && this.dom.createProfileModalOverlay.classList.contains('active')) {
          this.closeCreateProfileModal();
        }
      }
    });
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Bootstrap on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initDotMatrixCanvas();
  window.talentMatcher = new TalentBridgeApp();
  window.TalentApp = window.talentMatcher;
});
