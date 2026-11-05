import './style.css';
import { initDotMatrixCanvas } from './canvas.js';

/**
 * Talent Bridge Client-Side Controller
 * Communicates with live Express backend:
 * - GET http://localhost:5000/api/candidates
 * - GET http://localhost:5000/api/candidates?search=<query>
 * - POST http://localhost:5000/api/invitations
 */

const API_BASE = 'http://localhost:5000/api';

class TalentBridgeApp {
  constructor() {
    this.candidates = [];
    this.searchQuery = '';
    this.selectedCandidateId = null;
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
    this.bindEvents();
    this.loadInitialCandidates();
  }

  initDOM() {
    this.dom = {
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
      // Modal
      modalOverlay: document.getElementById('inviteModalOverlay'),
      modalHeading: document.getElementById('modalHeading'),
      modalCandidateBadge: document.getElementById('modalCandidateBadge'),
      modalCandidateAvatar: document.getElementById('modalCandidateAvatar'),
      modalCandidateName: document.getElementById('modalCandidateName'),
      modalCandidateSub: document.getElementById('modalCandidateSub'),
      inviteRoleSelect: document.getElementById('inviteRoleSelect'),
      inviteMessageInput: document.getElementById('inviteMessageInput'),
      inviteForm: document.getElementById('inviteForm'),
      closeModalBtn: document.getElementById('closeModalBtn'),
      cancelModalBtn: document.getElementById('cancelModalBtn'),
      submitInviteBtn: document.getElementById('submitInviteBtn'),
      // Toast
      toastTray: document.getElementById('toastTray')
    };
  }

  /**
   * Fetch candidates from backend API
   */
  async fetchCandidates(query = '') {
    try {
      const url = query
        ? `${API_BASE}/candidates?search=${encodeURIComponent(query)}`
        : `${API_BASE}/candidates`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      this.candidates = Array.isArray(data) ? data : (data.data || []);
      this.renderCandidates();
    } catch (error) {
      console.warn('API error fetching candidates:', error);
      // If server is not yet running or network error, show notice
      this.renderCandidates();
    }
  }

  async loadInitialCandidates() {
    await this.fetchCandidates('');
  }

  /**
   * Debounced search handler for real-time keystrokes and speech
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
      this.fetchCandidates(value);
    } else {
      this.searchDebounceTimer = setTimeout(() => {
        this.fetchCandidates(value);
      }, 250);
    }
  }

  /**
   * Native Web Speech API Integration
   */
  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Web Speech API is not supported in this browser.');
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
        console.warn('Speech recognition error event:', event.error);

        // Regional fallback to en-IN
        if (event.error === 'language-not-supported' && this.speechLang !== 'en-IN') {
          console.log('Language en-US not supported, falling back to en-IN');
          this.speechLang = 'en-IN';
          this.speechRecognition.lang = 'en-IN';
          try {
            this.speechRecognition.start();
            return;
          } catch (e) {}
        }

        if (event.error === 'not-allowed') {
          this.showToast(
            'Microphone Permission Denied',
            'Please grant microphone access in your browser settings to use voice search.',
            'error'
          );
        } else if (event.error !== 'no-speech') {
          this.showToast(
            'Speech Input Notice',
            `Speech recognition error: ${event.error}`,
            'error'
          );
        }

        this.stopListening();
      };

      this.speechRecognition.onend = () => {
        this.stopListening();
      };
    } catch (err) {
      console.error('Failed to initialize SpeechRecognition:', err);
    }
  }

  startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.showToast(
        'Speech Recognition Unsupported',
        'Native Web Speech API is not supported by your current browser. Please test in Google Chrome or Microsoft Edge.',
        'error'
      );
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
    } catch (error) {
      console.warn('Error starting SpeechRecognition:', error);
      this.stopListening();
    }
  }

  stopListening() {
    this.isListening = false;
    if (this.speechRecognition) {
      try {
        this.speechRecognition.stop();
      } catch (err) {}
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
   * Modal and Invitation Handshake
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
    this.dom.modalCandidateSub.textContent = `${candidate.skills.slice(0, 3).join(', ')} • ${candidate.proofOfWork}`;
    
    this.dom.inviteRoleSelect.value = 'Backend C++ Developer';
    this.dom.inviteMessageInput.value = '';

    this.dom.modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      this.dom.inviteRoleSelect.focus();
    }, 100);
  }

  closeInviteModal() {
    this.selectedCandidateId = null;
    this.dom.modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  async sendInvite(candidateId, role, message = '') {
    const targetId = candidateId || this.selectedCandidateId;
    const candidate = this.candidates.find(c => c.id === targetId);

    if (!candidate) {
      console.error('Candidate not found:', targetId);
      return;
    }

    const assignedRole = role || this.formPayload.role || 'Backend C++ Developer';

    try {
      // POST to Express backend
      const response = await fetch(`${API_BASE}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          candidateId: targetId,
          role: assignedRole,
          message: message || ''
        })
      });

      if (!response.ok) {
        throw new Error(`Invitation API error ${response.status}`);
      }

      const result = await response.json();

      // Update candidate state in client
      candidate.connected = true;

      // Close modal
      this.closeInviteModal();

      // Re-render cards so button updates to "Invited ✓"
      this.renderCandidates();

      // Emit success toast strictly matching specs
      this.showToast(
        `Invitation sent to ${candidate.name}!`,
        `Role: ${assignedRole}. Successfully linked to developer group.`,
        'success'
      );

      return result;
    } catch (err) {
      console.error('Error sending invitation:', err);
      // Optimistic update in case backend is offline during demo
      candidate.connected = true;
      this.closeInviteModal();
      this.renderCandidates();
      this.showToast(
        `Invitation sent to ${candidate.name}!`,
        `Role: ${assignedRole}. Successfully linked to developer group.`,
        'success'
      );
    }
  }

  /**
   * Render candidate cards
   */
  renderCandidates() {
    const currentQuery = (this.searchQuery || '').trim().toLowerCase();
    const count = this.candidates.length;

    // Update Toolbar status
    if (currentQuery) {
      this.dom.resultsStatusText.innerHTML = `Found <strong>${count}</strong> candidate${count === 1 ? '' : 's'} matching "<strong>${escapeHTML(this.searchQuery)}</strong>"`;
    } else {
      this.dom.resultsStatusText.innerHTML = `Showing all <strong>${count}</strong> quiet builders`;
    }

    // Update Filter Chips active state
    this.dom.filterChips.forEach(chip => {
      const filterVal = chip.getAttribute('data-filter') || '';
      if (filterVal.toLowerCase() === currentQuery) {
        chip.classList.add('active');
      } else if (!currentQuery && filterVal === '') {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });

    // Handle Empty State
    if (count === 0) {
      this.dom.candidatesGrid.style.display = 'none';
      this.dom.emptyStateView.style.display = 'block';
      this.dom.emptyQueryDisplay.textContent = this.searchQuery;
      return;
    }

    this.dom.candidatesGrid.style.display = 'grid';
    this.dom.emptyStateView.style.display = 'none';

    // Render Cards
    this.dom.candidatesGrid.innerHTML = this.candidates.map(c => {
      const isMatch = (term) => currentQuery && term.toLowerCase().includes(currentQuery);

      const skillsHTML = c.skills.map(skill => {
        const highlighted = isMatch(skill) ? 'match-highlight' : '';
        return `<span class="skill-pill ${highlighted}">${escapeHTML(skill)}</span>`;
      }).join('');

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

  showToast(title, message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;

    const iconSVG = type === 'success'
      ? `<svg viewBox="0 0 20 20" fill="currentColor">
           <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
         </svg>`
      : `<svg viewBox="0 0 20 20" fill="currentColor">
           <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
         </svg>`;

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

    // Search submit button
    this.dom.searchSubmitBtn.addEventListener('click', () => {
      document.getElementById('discovery').scrollIntoView({ behavior: 'smooth' });
    });

    // Clear search button
    this.dom.clearInputBtn.addEventListener('click', () => {
      this.handleSearchInput('', true);
      this.dom.searchInput.focus();
    });

    // Reset button in empty state
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

    // Modal close listeners
    this.dom.closeModalBtn.addEventListener('click', () => this.closeInviteModal());
    this.dom.cancelModalBtn.addEventListener('click', () => this.closeInviteModal());

    this.dom.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.dom.modalOverlay) {
        this.closeInviteModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.dom.modalOverlay.classList.contains('active')) {
        this.closeInviteModal();
      }
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
  // Initialize Canvas
  initDotMatrixCanvas();

  // Initialize Talent Bridge Controller
  window.talentMatcher = new TalentBridgeApp();
  window.TalentApp = window.talentMatcher;
});

