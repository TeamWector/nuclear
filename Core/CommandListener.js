import { me } from './ObjectManager';
import Settings from './Settings';

/**
 * Failed-cast pause.
 *
 * When one of the player's own manual casts fails (SPELL_CAST_FAILED sourced
 * from us), briefly pause the bot rotation so the manual cast can go through
 * instead of the bot stomping it on the next GCD. The pause window is published
 * via globalThis.__nuclearFailPauseUntil and consumed by nuclear.tick().
 *
 * This is deliberately NOT a queue: nothing is captured and re-cast on the
 * player's behalf. (The old spell-queue / auto-requeue systems were removed
 * because they replayed manual casts on a stale target.)
 */
class FailedCastListener extends wow.EventListener {
  onEvent(event) {
    if (event.name !== "COMBAT_LOG_EVENT_UNFILTERED") return;
    const [eventData] = event.args;

    if (eventData.eventType !== 7 || !eventData.source?.guid?.equals(me?.guid)) return;
    if (!Settings.PauseRotationOnFailedCasts) return;

    const pauseMs = Settings.FailedCastPauseMs ?? 50;
    globalThis.__nuclearFailPauseUntil = wow.frameTime + pauseMs;

    if (Settings.FailedCastPauseDebugLogs) {
      const spellId = eventData.args?.[0];
      let spellLabel = `${spellId ?? "unknown"}`;
      if (spellId) {
        try {
          const spell = new wow.Spell(spellId);
          spellLabel = spell?.name || `${spellId}`;
        } catch {}
      }
      console.info(`Spell cast ${spellLabel} failed, pausing for ${pauseMs}ms`);
    }
  }
}

new FailedCastListener();
