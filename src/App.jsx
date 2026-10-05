import { useCallback, useEffect, useState } from 'react';
import Navbar from './components/Navbar';
import ProfileInput from './components/ProfileInput';
import ConstellationView from './components/ConstellationView';
import Methodology from './components/Methodology';
import { MOCK_SAMPLE_PROFILE } from './data/mockData';
import { useAudioFeedback } from './hooks/useAudioFeedback';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';
import {
  clearStoredProfile,
  loadStoredProfile,
  saveStoredProfile,
} from './lib/profileStorage';

/** The one sample profile offered in the entry form — real, matched data. */
const SAMPLE_PROFILE = MOCK_SAMPLE_PROFILE;
const FADE_MS = 420;

export default function App() {
  // A returning visitor goes straight back to their sky, not a blank form.
  const [bootProfile] = useState(loadStoredProfile);
  const [profile, setProfile] = useState(bootProfile);
  const [screen, setScreen] = useState(bootProfile ? 'constellation' : 'profile');
  const [transitioning, setTransitioning] = useState(false);
  const audio = useAudioFeedback();
  const reducedMotion = usePrefersReducedMotion();

  // The constellation is a fixed stage: keep the page itself from scrolling.
  useEffect(() => {
    document.documentElement.dataset.screen = screen;
    return () => {
      delete document.documentElement.dataset.screen;
    };
  }, [screen]);

  /** Fade helper. `swap` runs once the old screen has faded out. */
  const transitionTo = useCallback(
    (swap) => {
      if (reducedMotion) {
        swap();
        return;
      }
      setTransitioning(true);
      window.setTimeout(() => {
        swap();
        setTransitioning(false);
      }, FADE_MS);
    },
    [reducedMotion]
  );

  const goToConstellation = useCallback(
    (nextProfile) => {
      saveStoredProfile(nextProfile);
      setProfile(nextProfile);
      audio.play('reveal');
      transitionTo(() => setScreen('constellation'));
    },
    [audio, transitionTo]
  );

  const goToProfile = useCallback(() => {
    audio.play('click');
    transitionTo(() => setScreen('profile'));
  }, [audio, transitionTo]);

  /** Navbar navigation: Explorer = the sky (or the entry form if no profile). */
  const navigate = useCallback(
    (target) => {
      audio.play('click');
      transitionTo(() => {
        if (target === 'methodology') {
          setScreen('methodology');
        } else {
          setScreen(profile ? 'constellation' : 'profile');
        }
      });
    },
    [audio, transitionTo, profile]
  );

  const startOver = useCallback(() => {
    audio.play('close');
    clearStoredProfile();
    // Cleared only after the fade, so the sky never renders without a profile.
    transitionTo(() => {
      setProfile(null);
      setScreen('profile');
    });
  }, [audio, transitionTo]);

  return (
    <div className={`app${transitioning ? ' is-transitioning' : ''}`}>
      <Navbar
        screen={screen}
        audio={audio}
        onEditProfile={goToProfile}
        onNavigate={navigate}
      />

      {screen === 'constellation' && profile && (
        <ConstellationView
          profile={profile}
          audio={audio}
          onEditProfile={goToProfile}
          onStartOver={startOver}
        />
      )}

      {screen === 'profile' && (
        <ProfileInput
          initialProfile={profile}
          onSubmit={goToConstellation}
          sample={SAMPLE_PROFILE}
        />
      )}

      {screen === 'methodology' && <Methodology />}
    </div>
  );
}
