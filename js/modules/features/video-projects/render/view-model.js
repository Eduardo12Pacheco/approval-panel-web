import {
  isBlockedImageCandidate,
  orderCandidatesByQuality,
} from '../domain/image-candidates.js';
import { getStatusLabel } from '../domain/status-labels.js';
import { resolveVideoProjectTitle } from '../domain/project-identity.js';
import { DEFAULT_MUSIC_VOLUME } from '../domain/editor-state.js';

const EDITOR_PHASES = ['preparing', 'preview_rendering', 'preview_ready', 'editing_dirty', 'final_rendering', 'final_ready', 'error'];
const EDITOR_SHELL_PHASES = ['preview_ready', 'editing_dirty', 'final_ready', 'error'];

export function buildSelectedVideoProjectViewModel(project = {}, state = {}) {
  const allCandidates = Array.isArray(project.image_candidates) ? project.image_candidates : [];
  const candidates = orderCandidatesByQuality(allCandidates.filter((candidate) => !isBlockedImageCandidate(candidate)));
  const googleCandidates = candidates.filter((candidate) => (candidate.provider || candidate.source || '').toString() !== 'user-upload');
  const customCandidates = candidates.filter((candidate) => (candidate.provider || candidate.source || '').toString() === 'user-upload');

  const selectedImageUrls = Array.isArray(project.selected_images) ? project.selected_images : [];
  const segments = Array.isArray(project.segments) ? project.segments : [];
  const requiredImageCount = Math.max(segments.length, 1);
  const hasEnoughSelectedImages = selectedImageUrls.length >= requiredImageCount;

  const loading = Boolean(state.videoProjectDetailLoading);
  const preparingImages = Boolean(state.videoProjectDetailImagesPreparing);
  const detailPending = loading || preparingImages;
  const currentStep = project._videoProjectStep === 'audio' ? 'audio' : 'images';

  const voiceAudio = project.voice_audio && typeof project.voice_audio === 'object' ? project.voice_audio : {};
  const backgroundAudio = project.background_audio && typeof project.background_audio === 'object' ? project.background_audio : {};
  const voiceUploading = Boolean(project._voiceAudioUploading);
  const backgroundUploading = Boolean(project._backgroundAudioUploading);
  const canPreparePreview = Boolean(hasEnoughSelectedImages && voiceAudio.public_url && backgroundAudio.public_url);

  const editorState = project.editor_state && typeof project.editor_state === 'object' ? project.editor_state : {};
  const editorPhase = (editorState.phase || 'idle').toString();
  const timedRows = Array.isArray(editorState.timed_rows) ? editorState.timed_rows : [];
  const editorRows = Array.isArray(project._editorRows) ? project._editorRows : timedRows;
  const globalAudio = project._globalAudio || { voice: { volume: 1, muted: false }, music: { volume: DEFAULT_MUSIC_VOLUME, muted: false } };
  const inEditorPhase = EDITOR_PHASES.includes(editorPhase);
  const editorShellMode = inEditorPhase && EDITOR_SHELL_PHASES.includes(editorPhase);

  return {
    title: resolveVideoProjectTitle(project),
    player: (project.jugador || 'Sin jugador').toString(),
    country: (project.seleccion || 'Sin selección').toString(),
    statusLabel: getStatusLabel(project.status),
    statusName: (project.status || '').toString(),
    searchQuery: (project.search_query || project.image_search_meta?.query || 'Sin query registrada').toString(),
    fetchedAt: project.image_fetched_at || project.image_search_meta?.fetched_at || project.updated_at,
    candidates,
    googleCandidates,
    customCandidates,
    googleCandidateCount: googleCandidates.length || project.image_count,
    imageMetaCount: candidates.length || Number(project.image_count || 0),
    selectedImageUrls,
    selectedImageCount: selectedImageUrls.length,
    segments,
    segmentCount: segments.length,
    requiredImageCount,
    hasEnoughSelectedImages,
    loading,
    preparingImages,
    detailPending,
    currentStep,
    voiceAudio,
    backgroundAudio,
    voiceUploading,
    backgroundUploading,
    canPreparePreview,
    editorState,
    editorPhase,
    timedRows,
    editorRows,
    globalAudio,
    inEditorPhase,
    editorShellMode,
  };
}
