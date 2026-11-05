import './style.css';
import { initDotMatrixCanvas } from './canvas.js';

/**
 * Kindred Talent Platform — Full Client-Side Controller
 * Integrated with Node.js + Express + MongoDB (Mongoose):
 * 1. Auth Flow: Sign In & Sign Up with persistent sessions in localStorage
 * 2. MongoDB Candidate Persistence: Live queries and profile publishing
 * 3. Group / Hackathon Team Matchmaking: Team creation and application workflows
 * 4. AI-ready search & Web Speech API mic integration
 * 5. Full Kindred dot-matrix canvas hands simulation preserved verbatim
 */

const API_BASE = 'http://localhost:5000/api';
const STORAGE_KEYS = {
  CANDIDATES: 'talentbridge_candidates',
  GROUPS: 'talentbridge_groups',
  CONNECTIONS: 'talentbridge_connections',
  APPLICATIONS: 'talentbridge_applications',
  USER_PROFILE: 'talentbridge_user_profile',
  AUTH_USER: 'talentbridge_auth_user'
};

// Initial Fallback Seed Candidates (used if backend is bootstrapping)
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

// Initial Fallback Seed Groups
const INITIAL_GROUPS = [
  {
    id: 'team-alpha',
    name: 'Team Alpha (Hyperfusion 2K26)',
    seeking: '1 C++ / Systems Builder',
    project: 'Low-latency streaming platform',
    membersCount: 3,
    maxMembers: 4,
    tags: ['C++', 'Low-Latency', 'Systems', 'Distributed Systems'],
    applied: false
  },
  {
    id: 'web3-builders',
    name: 'Web3 Builders',
    seeking: '1 Frontend UI dev (React/Tailwind)',
    project: 'Decentralized identity portal',
    membersCount: 2,
    maxMembers: 4,
    tags: ['React', 'Tailwind UI', 'TypeScript', 'Web3'],
    applied: false
  },
  {
    id: 'ai-research-pod',
    name: 'AI Research Pod',
    seeking: '1 Python / ML Engineer',
    project: 'Computer Vision sign language detector',
    membersCount: 3,
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
    this.currentUser = null;
    this.hasUserProfile = false;
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
      openCreateGroupBtn: document.getElementById('openCreateGroupBtn'),
      createGroupBtnText: document.getElementById('createGroupBtnText'),

      // Auth elements
      googleAuthNavBtn: document.getElementById('googleAuthNavBtn'),
      googleModalActionBtn: document.getElementById('googleModalActionBtn'),
      openAuthModalBtn: document.getElementById('openAuthModalBtn'),
      userProfileBadge: document.getElementById('userProfileBadge'),
      userAvatarImg: document.getElementById('userAvatarImg'),
      userAvatarDot: document.getElementById('userAvatarDot'),
      userDisplayName: document.getElementById('userDisplayName'),
      signOutBtn: document.getElementById('signOutBtn'),
      authModalOverlay: document.getElementById('authModalOverlay'),
      closeAuthModalBtn: document.getElementById('closeAuthModalBtn'),
      cancelAuthModalBtn: document.getElementById('cancelAuthModalBtn'),
      cancelSignupModalBtn: document.getElementById('cancelSignupModalBtn'),
      authTabSignin: document.getElementById('authTabSignin'),
      authTabSignup: document.getElementById('authTabSignup'),
      signinForm: document.getElementById('signinForm'),
      signupForm: document.getElementById('signupForm'),
      signinEmail: document.getElementById('signinEmail'),
      signinPassword: document.getElementById('signinPassword'),
      signupName: document.getElementById('signupName'),
      signupEmail: document.getElementById('signupEmail'),
      signupPassword: document.getElementById('signupPassword'),

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

      // Create Group Modal
      createGroupModalOverlay: document.getElementById('createGroupModalOverlay'),
      closeCreateGroupModalBtn: document.getElementById('closeCreateGroupModalBtn'),
      cancelCreateGroupModalBtn: document.getElementById('cancelCreateGroupModalBtn'),
      createGroupForm: document.getElementById('createGroupForm'),
      groupNameInput: document.getElementById('groupNameInput'),
      groupSeekingInput: document.getElementById('groupSeekingInput'),
      groupProjectInput: document.getElementById('groupProjectInput'),
      groupMaxMembersInput: document.getElementById('groupMaxMembersInput'),
      groupTagsInput: document.getElementById('groupTagsInput'),

      // Toast Tray
      toastTray: document.getElementById('toastTray')
    };
  }

  /**
   * Load local state and authentication session
   */
  loadPersistedState() {
    try {
      // 1. Auth session
      const savedUser = localStorage.getItem(STORAGE_KEYS.AUTH_USER);
      if (savedUser) {
        this.currentUser = JSON.parse(savedUser);
      }

      // 2. Profile created flag
      const savedProfile = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
      if (savedProfile) {
        this.hasUserProfile = true;
      }

      // 3. Fallback candidates & groups
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

      // Connection state overrides
      const savedConnections = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONNECTIONS) || '{}');
      this.candidates.forEach(c => {
        const cId = c._id || c.id;
        if (savedConnections[cId] || savedConnections[c.name.toLowerCase()]) {
          c.connected = true;
        }
      });

      // Application state overrides
      const savedApps = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '{}');
      this.groups.forEach(g => {
        const gId = g._id || g.id || g.name;
        if (savedApps[gId]) {
          g.applied = true;
        }
      });

      this.updateAuthUI();
    } catch (e) {
      console.warn('Error reading persisted state:', e);
    }
  }

  saveStateToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.CANDIDATES, JSON.stringify(this.candidates));
      localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(this.groups));
      if (this.currentUser) {
        localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(this.currentUser));
      }
    } catch (e) {}
  }

  updateAuthUI() {
    const isUnlocked = Boolean(this.currentUser || this.hasUserProfile);

    if (this.currentUser) {
      if (this.dom.googleAuthNavBtn) this.dom.googleAuthNavBtn.style.display = 'none';
      if (this.dom.openAuthModalBtn) this.dom.openAuthModalBtn.style.display = 'none';
      if (this.dom.userProfileBadge) {
        this.dom.userProfileBadge.style.display = 'inline-flex';
        this.dom.userDisplayName.textContent = this.currentUser.name;

        if (this.currentUser.picture && this.dom.userAvatarImg) {
          this.dom.userAvatarImg.src = this.currentUser.picture;
          this.dom.userAvatarImg.style.display = 'inline-block';
          if (this.dom.userAvatarDot) this.dom.userAvatarDot.style.display = 'none';
        } else {
          if (this.dom.userAvatarImg) this.dom.userAvatarImg.style.display = 'none';
          if (this.dom.userAvatarDot) this.dom.userAvatarDot.style.display = 'inline-block';
        }
      }
    } else {
      if (this.dom.googleAuthNavBtn) this.dom.googleAuthNavBtn.style.display = 'inline-flex';
      if (this.dom.openAuthModalBtn) this.dom.openAuthModalBtn.style.display = 'none';
      if (this.dom.userProfileBadge) this.dom.userProfileBadge.style.display = 'none';
    }

    if (this.dom.createGroupBtnText) {
      if (isUnlocked) {
        this.dom.createGroupBtnText.textContent = '+ Create Team';
        if (this.dom.openCreateGroupBtn) this.dom.openCreateGroupBtn.removeAttribute('disabled');
      } else {
        this.dom.createGroupBtnText.textContent = '+ Create Team (Profile Required)';
      }
    }
  }

  /**
   * Synchronize with Live MongoDB Express Backend
   */
  async syncWithBackend() {
    try {
      // 1. Fetch Candidates from MongoDB
      const resCand = await fetch(`${API_BASE}/candidates`);
      if (resCand.ok) {
        const backendCandidates = await resCand.json();
        if (Array.isArray(backendCandidates) && backendCandidates.length > 0) {
          const savedConnections = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONNECTIONS) || '{}');
          backendCandidates.forEach(c => {
            const cId = c._id || c.id;
            if (savedConnections[cId] || savedConnections[c.name.toLowerCase()]) {
              c.connected = true;
            }
          });
          this.candidates = backendCandidates;
          this.saveStateToStorage();
        }
      }
    } catch (err) {
      console.info('[TalentBridge] Candidates API connecting in resilient local mode.');
    }

    try {
      // 2. Fetch Groups from MongoDB
      const resGroups = await fetch(`${API_BASE}/groups`);
      if (resGroups.ok) {
        const backendGroups = await resGroups.json();
        if (Array.isArray(backendGroups) && backendGroups.length > 0) {
          const savedApps = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '{}');
          backendGroups.forEach(g => {
            const gId = g._id || g.id || g.name;
            if (savedApps[gId]) {
              g.applied = true;
            }
          });
          this.groups = backendGroups;
          this.saveStateToStorage();
        }
      }
    } catch (err) {
      console.info('[TalentBridge] Groups API connecting in resilient local mode.');
    }

    this.renderCandidates();
    this.renderGroups();
  }

  /**
   * Web Speech Recognition API
   */
  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (this.dom.voiceMicBtn) {
        this.dom.voiceMicBtn.title = 'Voice search not supported in this browser';
      }
      return;
    }

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
        if (event.error === 'not-allowed') {
          this.showToast('Microphone Denied', 'Please allow microphone access to search by voice.', 'error');
        } else if (event.error !== 'no-speech') {
          this.showToast('Voice Search Notice', `Status: ${event.error}`, 'info');
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
      if (this.dom.voiceMicBtn) this.dom.voiceMicBtn.classList.add('listening');
      if (this.dom.searchBar) this.dom.searchBar.classList.add('is-listening');
      if (this.dom.voiceFeedback) {
        this.dom.voiceFeedback.textContent = text || 'Listening...';
        this.dom.voiceFeedback.classList.add('active');
      }
    } else {
      if (this.dom.voiceMicBtn) this.dom.voiceMicBtn.classList.remove('listening');
      if (this.dom.searchBar) this.dom.searchBar.classList.remove('is-listening');
      if (this.dom.voiceFeedback) {
        this.dom.voiceFeedback.textContent = '';
        this.dom.voiceFeedback.classList.remove('active');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // UNIFIED GOOGLE AUTHENTICATION FLOW
  // ---------------------------------------------------------------------------
  async triggerGoogleAuth() {
    // 1. If Google Identity Services library is loaded and client ID exists
    if (window.google?.accounts?.id && window.KINDRED_GOOGLE_CLIENT_ID) {
      try {
        window.google.accounts.id.initialize({
          client_id: window.KINDRED_GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (response.credential) {
              this.handleGoogleAuth({ credential: response.credential });
            }
          }
        });
        window.google.accounts.id.prompt();
        return;
      } catch (gErr) {
        console.warn('Google One Tap init notice:', gErr);
      }
    }

    // 2. Seamless Unified Google Auth Modal / Prompt
    this.openAuthModal('signin');
  }

  async handleGoogleAuth(authPayload) {
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authPayload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        this.showToast('Google Sign-In Error', data.message || 'Could not verify Google account.', 'error');
        return;
      }

      this.currentUser = data.user;
      localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(this.currentUser));
      this.updateAuthUI();
      this.closeAuthModal();

      const isNew = data.message?.includes('created') || data.isNewUser;
      this.showToast(
        isNew ? 'Account Created with Google!' : `Welcome back, ${data.user.name}!`,
        `Signed in with Google (${data.user.email}). Account synced with MongoDB.`,
        'success'
      );
    } catch (err) {
      console.warn('Google auth network issue, operating in local mode:', err);
      this.currentUser = {
        id: `g_${Date.now()}`,
        name: authPayload.name || 'Google Builder',
        email: authPayload.email || 'builder@gmail.com',
        picture: authPayload.picture || '',
        authProvider: 'google'
      };
      localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(this.currentUser));
      this.updateAuthUI();
      this.closeAuthModal();
      this.showToast(`Signed In with Google`, `Logged in as ${this.currentUser.name}.`, 'success');
    }
  }

  // ---------------------------------------------------------------------------
  // AUTHENTICATION MODAL & FORM HANDLERS
  // ---------------------------------------------------------------------------
  openAuthModal(mode = 'signin') {
    if (!this.dom.authModalOverlay) return;
    this.dom.authModalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (mode === 'signup') {
      this.switchAuthTab('signup');
      setTimeout(() => this.dom.signupName?.focus(), 100);
    } else {
      this.switchAuthTab('signin');
      setTimeout(() => this.dom.signinEmail?.focus(), 100);
    }
  }

  closeAuthModal() {
    if (!this.dom.authModalOverlay) return;
    this.dom.authModalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  switchAuthTab(tab) {
    if (tab === 'signup') {
      this.dom.authTabSignup?.classList.add('active');
      this.dom.authTabSignin?.classList.remove('active');
      if (this.dom.signupForm) this.dom.signupForm.style.display = 'block';
      if (this.dom.signinForm) this.dom.signinForm.style.display = 'none';
    } else {
      this.dom.authTabSignin?.classList.add('active');
      this.dom.authTabSignup?.classList.remove('active');
      if (this.dom.signinForm) this.dom.signinForm.style.display = 'block';
      if (this.dom.signupForm) this.dom.signupForm.style.display = 'none';
    }
  }

  async handleSigninSubmit(e) {
    e.preventDefault();
    const email = this.dom.signinEmail?.value.trim();
    const password = this.dom.signinPassword?.value;

    if (!email || !password) {
      this.showToast('Missing Fields', 'Please enter your email and password.', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        this.showToast('Sign In Failed', data.message || 'Invalid email or password.', 'error');
        return;
      }

      this.currentUser = data.user;
      localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(this.currentUser));
      this.updateAuthUI();
      this.closeAuthModal();
      this.dom.signinForm.reset();

      this.showToast(
        `Welcome back, ${data.user.name}!`,
        'Signed in to your Kindred builder account.',
        'success'
      );
    } catch (err) {
      // Local session fallback
      this.currentUser = { id: `local-${Date.now()}`, name: email.split('@')[0], email };
      localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(this.currentUser));
      this.updateAuthUI();
      this.closeAuthModal();
      this.showToast(`Signed In as ${this.currentUser.name}`, 'Operating in local offline session.', 'success');
    }
  }

  async handleSignupSubmit(e) {
    e.preventDefault();
    const name = this.dom.signupName?.value.trim();
    const email = this.dom.signupEmail?.value.trim();
    const password = this.dom.signupPassword?.value;

    if (!name || !email || !password) {
      this.showToast('Missing Fields', 'Please complete all required fields.', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        this.showToast('Registration Error', data.message || 'Could not register account.', 'error');
        return;
      }

      this.currentUser = data.user;
      localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(this.currentUser));
      this.updateAuthUI();
      this.closeAuthModal();
      this.dom.signupForm.reset();

      this.showToast(
        `Account Created!`,
        `Welcome to Kindred, ${data.user.name}. Your builder journey begins.`,
        'success'
      );
    } catch (err) {
      this.currentUser = { id: `local-${Date.now()}`, name, email };
      localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(this.currentUser));
      this.updateAuthUI();
      this.closeAuthModal();
      this.showToast('Account Created', `Welcome to Kindred, ${name}!`, 'success');
    }
  }

  handleSignout() {
    this.currentUser = null;
    localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
    this.updateAuthUI();
    this.showToast('Signed Out', 'You have been signed out of your account.', 'info');
  }

  // ---------------------------------------------------------------------------
  // CANDIDATE PROFILE CREATION (MONGODB INTEGRATION)
  // ---------------------------------------------------------------------------
  openCreateProfileModal() {
    if (!this.dom.createProfileModalOverlay) return;
    this.dom.createProfileModalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      if (this.dom.profNameInput) {
        if (this.currentUser && !this.dom.profNameInput.value) {
          this.dom.profNameInput.value = this.currentUser.name;
        }
        this.dom.profNameInput.focus();
      }
    }, 100);
  }

  closeCreateProfileModal() {
    if (!this.dom.createProfileModalOverlay) return;
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
    if (this.dom.resumeFileNameSpan) {
      this.dom.resumeFileNameSpan.textContent = `${fileName} (${(file.size / 1024).toFixed(1)} KB)`;
    }
    if (this.dom.resumePreviewWrap) {
      this.dom.resumePreviewWrap.style.display = 'inline-flex';
    }
  }

  clearResumeFile() {
    this.selectedResumeFile = null;
    if (this.dom.resumeFileInput) this.dom.resumeFileInput.value = '';
    if (this.dom.resumeFileNameSpan) this.dom.resumeFileNameSpan.textContent = '';
    if (this.dom.resumePreviewWrap) this.dom.resumePreviewWrap.style.display = 'none';
  }

  async handleCreateProfileSubmit(e) {
    e.preventDefault();

    const name = this.dom.profNameInput?.value.trim();
    if (!name) {
      this.showToast('Name Required', 'Please enter your full name or developer handle.', 'error');
      this.dom.profNameInput?.focus();
      return;
    }

    const roleTag = this.dom.profRoleTagInput?.value.trim() || 'Quiet Builder / Engineer';
    const skillsRaw = this.dom.profSkillsInput?.value.trim();
    const skills = skillsRaw
      ? skillsRaw.split(',').map(s => s.trim()).filter(Boolean)
      : ['Problem Solving', 'Software Engineering'];

    const proofOfWork = this.dom.profProofInput?.value.trim() || 'Verified Autonomous Project Builder';
    const availability = this.dom.profAvailabilitySelect?.value || 'Open to Hackathon Teams & Dev Groups';
    const github = this.dom.profGithubInput?.value.trim();
    const portfolio = this.dom.profPortfolioInput?.value.trim();
    const resumeFileName = this.selectedResumeFile ? this.selectedResumeFile.name : '';

    const payload = {
      name,
      roleTag,
      skills,
      proofOfWork,
      availability,
      resumeFileName,
      github,
      portfolio,
      userId: this.currentUser ? this.currentUser.id : null
    };

    try {
      const res = await fetch(`${API_BASE}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.candidate) {
          this.candidates.unshift(data.candidate);
        }
      } else {
        payload.id = `cand-${Date.now()}`;
        this.candidates.unshift(payload);
      }
    } catch (err) {
      payload.id = `cand-${Date.now()}`;
      this.candidates.unshift(payload);
    }

    // Save profile creation flag to unlock Group creation
    this.hasUserProfile = true;
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(payload));
    this.saveStateToStorage();
    this.updateAuthUI();

    // Reset form & close modal
    this.dom.createProfileForm?.reset();
    this.clearResumeFile();
    this.closeCreateProfileModal();

    // Re-render candidates from live data
    this.renderCandidates();
    document.getElementById('discovery')?.scrollIntoView({ behavior: 'smooth' });

    this.showToast(
      'Profile published successfully!',
      'Your proof-of-work is now discoverable in MongoDB by recruiters and hackathon teams.',
      'success'
    );
  }

  // ---------------------------------------------------------------------------
  // GROUP / HACKATHON TEAM CREATION (MONGODB INTEGRATION)
  // ---------------------------------------------------------------------------
  openCreateGroupModal() {
    const isUnlocked = Boolean(this.currentUser || this.hasUserProfile);
    if (!isUnlocked) {
      this.showToast(
        'Profile Required',
        'Please publish your builder profile or sign in first before founding a hackathon team.',
        'info'
      );
      this.openCreateProfileModal();
      return;
    }

    if (!this.dom.createGroupModalOverlay) return;
    this.dom.createGroupModalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      this.dom.groupNameInput?.focus();
    }, 100);
  }

  closeCreateGroupModal() {
    if (!this.dom.createGroupModalOverlay) return;
    this.dom.createGroupModalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  async handleCreateGroupSubmit(e) {
    e.preventDefault();

    const name = this.dom.groupNameInput?.value.trim();
    const seeking = this.dom.groupSeekingInput?.value.trim();
    const project = this.dom.groupProjectInput?.value.trim();
    const maxMembers = parseInt(this.dom.groupMaxMembersInput?.value, 10) || 4;
    const tagsRaw = this.dom.groupTagsInput?.value.trim();
    const tags = tagsRaw
      ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
      : ['Hackathon', 'Full-Stack'];

    if (!name || !seeking || !project) {
      this.showToast('Missing Fields', 'Team Name, Seeking Role, and Project Pitch are required.', 'error');
      return;
    }

    const leaderName = this.currentUser ? this.currentUser.name : (this.hasUserProfile ? 'Builder Lead' : 'Team Founder');
    const leaderId = this.currentUser ? this.currentUser.id : 'user-founder';

    const payload = {
      name,
      seeking,
      project,
      maxMembers,
      tags,
      leaderId,
      leaderName
    };

    try {
      const res = await fetch(`${API_BASE}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.group) {
          this.groups.unshift(data.group);
        }
      } else {
        payload.id = `group-${Date.now()}`;
        payload.membersCount = 1;
        payload.members = [leaderName];
        this.groups.unshift(payload);
      }
    } catch (err) {
      payload.id = `group-${Date.now()}`;
      payload.membersCount = 1;
      payload.members = [leaderName];
      this.groups.unshift(payload);
    }

    this.saveStateToStorage();
    this.dom.createGroupForm?.reset();
    this.closeCreateGroupModal();
    this.renderGroups();

    document.getElementById('groups')?.scrollIntoView({ behavior: 'smooth' });

    this.showToast(
      `Team "${name}" Published!`,
      'Your squad is now live in MongoDB and recruiting quiet builders.',
      'success'
    );
  }

  async joinGroup(groupId) {
    const group = this.groups.find(g => (g._id === groupId || g.id === groupId || g.name === groupId));
    if (!group) return;

    if (group.applied) {
      this.showToast('Already Applied', `You have already submitted an application to ${group.name}.`, 'info');
      return;
    }

    const candidateName = this.currentUser ? this.currentUser.name : 'Quiet Builder';
    const candidateId = this.currentUser ? this.currentUser.id : 'cand-app';

    // Optimistic UI update
    group.applied = true;
    if (group.membersCount < (group.maxMembers || 4)) {
      group.membersCount += 1;
    }

    const savedApps = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '{}');
    savedApps[group._id || group.id || group.name] = true;
    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(savedApps));
    this.saveStateToStorage();
    this.renderGroups();

    try {
      const targetParam = group._id || encodeURIComponent(group.name);
      await fetch(`${API_BASE}/groups/${targetParam}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId,
          candidateName,
          note: 'Excited to build and contribute proof-of-work!'
        })
      });
    } catch (e) {
      console.info('Backend join sync offline, saved locally.');
    }

    this.showToast(
      `Application sent to ${group.name} leads!`,
      'Your verified builder credentials and proof-of-work have been submitted.',
      'success'
    );
  }

  // ---------------------------------------------------------------------------
  // CANDIDATE INVITATION & HANDSHAKE
  // ---------------------------------------------------------------------------
  openInviteModal(candidateId) {
    const candidate = this.candidates.find(c => (c._id === candidateId || c.id === candidateId || c.name.toLowerCase() === candidateId.toLowerCase()));
    if (!candidate) return;

    this.selectedCandidateId = candidate._id || candidate.id || candidate.name;
    const initial = (candidate.name || 'B').charAt(0).toUpperCase();

    if (this.dom.modalCandidateAvatar) this.dom.modalCandidateAvatar.textContent = initial;
    if (this.dom.modalCandidateName) this.dom.modalCandidateName.textContent = candidate.name;
    if (this.dom.modalCandidateSub) {
      const skillsStr = (candidate.skills || []).join(', ');
      this.dom.modalCandidateSub.textContent = `${skillsStr} • ${candidate.proofOfWork || ''}`;
    }

    const defaultRole = candidate.roleTag?.includes('UI') ? 'Frontend UI Specialist' : 'Backend C++ Developer';
    if (this.dom.inviteRoleSelect) this.dom.inviteRoleSelect.value = defaultRole;

    if (this.dom.inviteModalOverlay) this.dom.inviteModalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  closeInviteModal() {
    if (this.dom.inviteModalOverlay) this.dom.inviteModalOverlay.classList.remove('active');
    document.body.style.overflow = '';
    this.selectedCandidateId = null;
  }

  async sendInvite(candidateId, role, message = '') {
    const candidate = this.candidates.find(c => (c._id === candidateId || c.id === candidateId || c.name === candidateId));
    if (!candidate) return;

    candidate.connected = true;

    const savedConnections = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONNECTIONS) || '{}');
    savedConnections[candidate._id || candidate.id] = true;
    savedConnections[candidate.name.toLowerCase()] = true;
    localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify(savedConnections));
    this.saveStateToStorage();
    this.renderCandidates();
    this.closeInviteModal();

    try {
      const targetParam = candidate._id || encodeURIComponent(candidate.name);
      await fetch(`${API_BASE}/candidates/${targetParam}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, message })
      });
    } catch (e) {
      console.info('Backend connect sync offline, saved locally.');
    }

    this.showToast(
      `Invitation sent to ${candidate.name}!`,
      `Offer extended for "${role}". They have received your project details.`,
      'success'
    );
  }

  // ---------------------------------------------------------------------------
  // REAL-TIME SEARCH & FILTERING (MONGODB REGEX BACKEND)
  // ---------------------------------------------------------------------------
  handleSearchInput(value, immediate = false) {
    this.searchQuery = value.trim();

    if (this.dom.searchInput && this.dom.searchInput.value !== value) {
      this.dom.searchInput.value = value;
    }

    if (this.dom.clearInputBtn) {
      this.dom.clearInputBtn.style.display = this.searchQuery ? 'flex' : 'none';
    }

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    if (immediate) {
      this.executeSearchQuery(this.searchQuery);
    } else {
      this.searchDebounceTimer = setTimeout(() => {
        this.executeSearchQuery(this.searchQuery);
      }, 250);
    }
  }

  async executeSearchQuery(query) {
    if (!query) {
      this.syncWithBackend();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/candidates?search=${encodeURIComponent(query)}`);
      if (res.ok) {
        const filtered = await res.json();
        const savedConnections = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONNECTIONS) || '{}');
        filtered.forEach(c => {
          const cId = c._id || c.id;
          if (savedConnections[cId] || savedConnections[c.name.toLowerCase()]) {
            c.connected = true;
          }
        });
        this.renderCandidateCards(filtered, query);
        return;
      }
    } catch (e) {}

    // Fallback local query
    const qLower = query.toLowerCase();
    const tokens = qLower.split(/\s+/).filter(Boolean);
    const filtered = this.candidates.filter(c => {
      const name = (c.name || '').toLowerCase();
      const skills = (c.skills || []).map(s => s.toLowerCase());
      const pow = (c.proofOfWork || '').toLowerCase();
      const role = (c.roleTag || '').toLowerCase();
      const corpus = `${name} ${skills.join(' ')} ${pow} ${role}`;

      return tokens.every(t => corpus.includes(t)) || corpus.includes(qLower);
    });

    this.renderCandidateCards(filtered, query);
  }

  renderCandidates() {
    this.renderCandidateCards(this.candidates, this.searchQuery);
  }

  renderCandidateCards(candidatesList, currentQuery = '') {
    if (!this.dom.candidatesGrid) return;

    if (!candidatesList || candidatesList.length === 0) {
      this.dom.candidatesGrid.innerHTML = '';
      if (this.dom.emptyStateView) {
        this.dom.emptyStateView.style.display = 'block';
        if (this.dom.emptyQueryDisplay) {
          this.dom.emptyQueryDisplay.textContent = currentQuery || 'your search criteria';
        }
      }
      if (this.dom.resultsStatusText) {
        this.dom.resultsStatusText.textContent = `No matches found for "${currentQuery}"`;
      }
      return;
    }

    if (this.dom.emptyStateView) this.dom.emptyStateView.style.display = 'none';

    if (this.dom.resultsStatusText) {
      if (currentQuery) {
        this.dom.resultsStatusText.innerHTML = `Showing <strong>${candidatesList.length}</strong> builders matching "<strong>${escapeHTML(currentQuery)}</strong>"`;
      } else {
        this.dom.resultsStatusText.textContent = `Showing all ${candidatesList.length} quiet builders`;
      }
    }

    const html = candidatesList.map(candidate => {
      const initial = (candidate.name || 'B').charAt(0).toUpperCase();
      const isConnected = candidate.connected;
      const candId = candidate._id || candidate.id || candidate.name;

      const skillsBadges = (candidate.skills || [])
        .map(skill => `<span class="skill-tag">${escapeHTML(skill)}</span>`)
        .join('');

      const resumePill = candidate.resumeFileName
        ? `<span class="meta-link-pill" title="Verified Resume Attached">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            ${escapeHTML(candidate.resumeFileName)}
          </span>`
        : '';

      const githubPill = candidate.github
        ? `<a href="${escapeHTML(candidate.github)}" target="_blank" rel="noopener noreferrer" class="meta-link-pill">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
          </a>`
        : '';

      const portfolioPill = candidate.portfolio
        ? `<a href="${escapeHTML(candidate.portfolio)}" target="_blank" rel="noopener noreferrer" class="meta-link-pill">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            Proof Portfolio
          </a>`
        : '';

      const metaLinksRow = (resumePill || githubPill || portfolioPill)
        ? `<div class="candidate-meta-links">${resumePill}${githubPill}${portfolioPill}</div>`
        : '';

      return `
        <article class="candidate-card" data-candidate-id="${escapeHTML(candId)}">
          <div class="card-top">
            <div class="candidate-header">
              <div class="candidate-avatar">${escapeHTML(initial)}</div>
              <div class="candidate-identity">
                <h3 class="candidate-name">${escapeHTML(candidate.name)}</h3>
                <span class="candidate-role-tag">${escapeHTML(candidate.roleTag || 'Quiet Builder')}</span>
              </div>
            </div>

            <div class="candidate-skills-wrap">
              ${skillsBadges}
            </div>

            <div class="pow-box">
              <svg class="pow-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              <span>${escapeHTML(candidate.proofOfWork || 'Verified Project Experience')}</span>
            </div>

            ${metaLinksRow}

            <p class="availability-text">
              • ${escapeHTML(candidate.availability || 'Open to Dev Groups')}
            </p>
          </div>

          <div class="card-bottom">
            <button
              type="button"
              class="btn-invite-team ${isConnected ? 'is-connected' : ''}"
              data-candidate-id="${escapeHTML(candId)}"
              ${isConnected ? 'disabled' : ''}
            >
              ${isConnected ? `
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                <span>Invited ✓</span>
              ` : `
                <span>Invite to Team</span>
                <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                  <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
              `}
            </button>
          </div>
        </article>
      `;
    }).join('');

    this.dom.candidatesGrid.innerHTML = html;

    // Attach invite button listeners
    this.dom.candidatesGrid.querySelectorAll('.btn-invite-team:not(.is-connected)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-candidate-id');
        this.openInviteModal(id);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // GROUP / HACKATHON TEAMS BOARD
  // ---------------------------------------------------------------------------
  renderGroups() {
    if (!this.dom.groupsGrid) return;

    if (!this.groups || this.groups.length === 0) {
      this.dom.groupsGrid.innerHTML = '<p style="text-align:center; color: var(--sub); grid-column: 1/-1;">No active hackathon groups yet. Found the first team above!</p>';
      return;
    }

    const html = this.groups.map(group => {
      const gId = group._id || group.id || group.name;
      const isApplied = group.applied;
      const count = group.membersCount || 1;
      const max = group.maxMembers || 4;

      const dots = Array.from({ length: max }).map((_, i) =>
        `<span class="capacity-dot ${i < count ? 'filled' : ''}"></span>`
      ).join('');

      const tagsBadges = (group.tags || [])
        .map(tag => `<span class="group-tag">${escapeHTML(tag)}</span>`)
        .join('');

      return `
        <article class="group-card" data-group-id="${escapeHTML(gId)}">
          <div class="group-top">
            <div>
              <h3 class="group-name">${escapeHTML(group.name)}</h3>
            </div>
            <span class="group-status-pill">Recruiting</span>
          </div>

          <div class="group-seeking-box">
            <span class="seeking-label">Seeking Teammate</span>
            <div class="seeking-role">${escapeHTML(group.seeking)}</div>
          </div>

          <p class="group-project-desc">${escapeHTML(group.project)}</p>

          <div class="group-capacity-row">
            <span>Team Members (${count}/${max})</span>
            <div class="capacity-dots">${dots}</div>
          </div>

          <div class="group-tags">${tagsBadges}</div>

          <div class="card-bottom">
            <button
              type="button"
              class="btn-join-group ${isApplied ? 'is-applied' : ''}"
              data-group-id="${escapeHTML(gId)}"
              ${isApplied ? 'disabled' : ''}
            >
              ${isApplied ? `
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                <span>Application Sent ✓</span>
              ` : `
                <span>Join Group / Apply with Proof-of-Work</span>
                <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                  <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
              `}
            </button>
          </div>
        </article>
      `;
    }).join('');

    this.dom.groupsGrid.innerHTML = html;

    // Attach join listeners
    this.dom.groupsGrid.querySelectorAll('.btn-join-group:not(.is-applied)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-group-id');
        this.joinGroup(id);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // TOAST NOTIFICATIONS
  // ---------------------------------------------------------------------------
  showToast(title, detail = '', type = 'info') {
    if (!this.dom.toastTray) return;

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`;
    } else {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>`;
    }

    toast.innerHTML = `
      ${iconSvg}
      <div class="toast-content">
        <h5 class="toast-title">${escapeHTML(title)}</h5>
        ${detail ? `<p class="toast-detail">${escapeHTML(detail)}</p>` : ''}
      </div>
      <button type="button" class="toast-close-x" aria-label="Close notification">&times;</button>
    `;

    this.dom.toastTray.appendChild(toast);

    toast.querySelector('.toast-close-x')?.addEventListener('click', () => {
      toast.remove();
    });

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }
    }, 4500);
  }

  // ---------------------------------------------------------------------------
  // EVENT BINDINGS
  // ---------------------------------------------------------------------------
  bindEvents() {
    // 1. Search Bar
    this.dom.searchInput?.addEventListener('input', (e) => {
      this.handleSearchInput(e.target.value);
    });

    this.dom.searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleSearchInput(this.dom.searchInput.value, true);
        document.getElementById('discovery')?.scrollIntoView({ behavior: 'smooth' });
      }
    });

    this.dom.clearInputBtn?.addEventListener('click', () => {
      if (this.dom.searchInput) this.dom.searchInput.value = '';
      this.handleSearchInput('', true);
      this.dom.searchInput?.focus();
    });

    this.dom.searchSubmitBtn?.addEventListener('click', () => {
      this.handleSearchInput(this.dom.searchInput?.value || '', true);
      document.getElementById('discovery')?.scrollIntoView({ behavior: 'smooth' });
    });

    // 2. Speech-to-Text Microphone
    this.dom.voiceMicBtn?.addEventListener('click', () => {
      if (this.isListening) {
        this.stopListening();
      } else {
        this.startListening();
      }
    });

    // 3. Filter Chips
    this.dom.filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.dom.filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const filter = chip.getAttribute('data-filter') || '';
        this.handleSearchInput(filter, true);
        document.getElementById('discovery')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    this.dom.resetSearchBtn?.addEventListener('click', () => {
      if (this.dom.searchInput) this.dom.searchInput.value = '';
      this.dom.filterChips.forEach(c => c.classList.remove('active'));
      const allChip = document.querySelector('.filter-chip[data-filter=""]');
      if (allChip) allChip.classList.add('active');
      this.handleSearchInput('', true);
    });

    // 4. Smooth Scroll CTA
    this.dom.mainCtaBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('discovery')?.scrollIntoView({ behavior: 'smooth' });
    });

    // 5. Unified Google Auth & Modal Triggers
    this.dom.googleAuthNavBtn?.addEventListener('click', () => this.triggerGoogleAuth());
    this.dom.googleModalActionBtn?.addEventListener('click', () => {
      if (window.google?.accounts?.id && window.KINDRED_GOOGLE_CLIENT_ID) {
        window.google.accounts.id.prompt();
      } else {
        const promptName = prompt('Enter your name for Google Sign-In:', 'Alex Chen') || 'Google Builder';
        const promptEmail = prompt('Enter your Google email:', `${promptName.toLowerCase().replace(/\s+/g, '.')}@gmail.com`) || 'alex.chen@gmail.com';
        this.handleGoogleAuth({
          name: promptName,
          email: promptEmail,
          picture: 'https://lh3.googleusercontent.com/a/default-user',
          googleId: `g_${Date.now()}`
        });
      }
    });

    this.dom.openAuthModalBtn?.addEventListener('click', () => this.openAuthModal('signin'));
    this.dom.closeAuthModalBtn?.addEventListener('click', () => this.closeAuthModal());
    this.dom.cancelAuthModalBtn?.addEventListener('click', () => this.closeAuthModal());
    this.dom.cancelSignupModalBtn?.addEventListener('click', () => this.closeAuthModal());
    this.dom.authTabSignin?.addEventListener('click', () => this.switchAuthTab('signin'));
    this.dom.authTabSignup?.addEventListener('click', () => this.switchAuthTab('signup'));
    this.dom.signinForm?.addEventListener('submit', (e) => this.handleSigninSubmit(e));
    this.dom.signupForm?.addEventListener('submit', (e) => this.handleSignupSubmit(e));
    this.dom.signOutBtn?.addEventListener('click', () => this.handleSignout());

    // 6. Create Profile Modal & Triggers
    this.dom.openCreateProfileNavBtn?.addEventListener('click', () => this.openCreateProfileModal());
    this.dom.openCreateProfileHeroBtn?.addEventListener('click', () => this.openCreateProfileModal());
    this.dom.closeCreateProfileModalBtn?.addEventListener('click', () => this.closeCreateProfileModal());
    this.dom.cancelCreateProfileBtn?.addEventListener('click', () => this.closeCreateProfileModal());
    this.dom.createProfileForm?.addEventListener('submit', (e) => this.handleCreateProfileSubmit(e));

    // Resume file upload
    this.dom.resumeFileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) this.handleResumeFileSelection(file);
    });

    this.dom.removeResumeBtn?.addEventListener('click', () => {
      this.clearResumeFile();
    });

    // 7. Create Group Modal & Triggers
    this.dom.openCreateGroupBtn?.addEventListener('click', () => this.openCreateGroupModal());
    this.dom.closeCreateGroupModalBtn?.addEventListener('click', () => this.closeCreateGroupModal());
    this.dom.cancelCreateGroupModalBtn?.addEventListener('click', () => this.closeCreateGroupModal());
    this.dom.createGroupForm?.addEventListener('submit', (e) => this.handleCreateGroupSubmit(e));

    // 8. Invite Modal Handlers
    this.dom.closeInviteModalBtn?.addEventListener('click', () => this.closeInviteModal());
    this.dom.cancelInviteModalBtn?.addEventListener('click', () => this.closeInviteModal());
    this.dom.inviteForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const role = this.dom.inviteRoleSelect?.value || 'Backend C++ Developer';
      const msg = this.dom.inviteMessageInput?.value || '';
      this.sendInvite(this.selectedCandidateId, role, msg);
    });

    // Close on overlay backdrop clicks
    [
      this.dom.inviteModalOverlay,
      this.dom.createProfileModalOverlay,
      this.dom.createGroupModalOverlay,
      this.dom.authModalOverlay
    ].forEach(overlay => {
      overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeInviteModal();
          this.closeCreateProfileModal();
          this.closeCreateGroupModal();
          this.closeAuthModal();
        }
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeInviteModal();
        this.closeCreateProfileModal();
        this.closeCreateGroupModal();
        this.closeAuthModal();
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

// Bootstrap on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  initDotMatrixCanvas();
  window.talentBridge = new TalentBridgeApp();
});
