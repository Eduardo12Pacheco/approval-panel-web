const SUPABASE_AUDIO_PUBLIC_BASE = 'https://ulzcthcdakjfretjdakd.supabase.co/storage/v1/object/public/video-project-audio';
const DEFAULT_BACKGROUND_MUSIC_PREFIX = 'defaults/background-music';

function buildDefaultTrack({ id, label, fileName }) {
  const path = `${DEFAULT_BACKGROUND_MUSIC_PREFIX}/${fileName}`;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');

  return {
    id,
    label,
    fileName,
    path,
    public_url: `${SUPABASE_AUDIO_PUBLIC_BASE}/${encodedPath}`,
    mime_type: 'audio/wav',
  };
}

export const DEFAULT_BACKGROUND_MUSIC_TRACKS = [
  buildDefaultTrack({
    id: 'musica-pelotazo',
    label: 'Musica Pelotazo',
    fileName: 'musica-pelotazo-rapida.wav',
  }),
  buildDefaultTrack({
    id: 'trap-boxing',
    label: 'Trap Boxing',
    fileName: 'Trap-Boxing.wav',
  }),
  buildDefaultTrack({
    id: 'slow-motion',
    label: 'Slow Motion',
    fileName: 'sport-bass-slow.wav',
  }),
  buildDefaultTrack({
    id: 'epic-dramatic',
    label: 'Epic Dramatic',
    fileName: 'Epic-Dramatic-Cinematic.wav',
  }),
  buildDefaultTrack({
    id: 'trap-mma',
    label: 'Trap MMA',
    fileName: 'Trap-MMA.wav',
  }),
  buildDefaultTrack({
    id: 'on-a-mission',
    label: 'On a Mission',
    fileName: 'On-A-Mission.wav',
  }),
];

export function findDefaultBackgroundMusicTrack(trackId) {
  return DEFAULT_BACKGROUND_MUSIC_TRACKS.find((track) => track.id === trackId) || null;
}
