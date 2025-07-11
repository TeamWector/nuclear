import drTracker from '@/Core/DRTracker';
import cooldownTracker from '@/Core/CooldownTracker';
import Settings from '@/Core/Settings';

class PVP {
  static tabName = "PVP";

  static options = [
    { type: "checkbox", uid: "DRTrackerEnabled", text: "DR Tracker Enabled", default: true },
    { type: "checkbox", uid: "DRTrackerDebugLogs", text: "DR Tracker Debug Logs Enabled", default: false },
    { type: "checkbox", uid: "CooldownTrackerEnabled", text: "Cooldown Tracker Enabled", default: true },
    { type: "checkbox", uid: "CooldownTrackerDebugLogs", text: "Cooldown Tracker Debug Logs Enabled", default: false },
    { type: "checkbox", uid: "CooldownTrackerArenaOnly", text: "Cooldown Tracker Arena Only", default: true },
    { type: "checkbox", uid: "CooldownTrackerVisualThreats", text: "Show Visual Threat Lines", default: true },
  ];

  static renderOptions(renderFunction) {
    renderFunction([
      { header: "Diminishing Returns", options: this.options.slice(0, 2) },
      { header: "Cooldown Tracking", options: this.options.slice(2) },
    ]);
  }

  static tick() {
    this.updateDRTracker();
    this.updateCooldownTracker();
  }

  static updateDRTracker() {
    // Update DR tracker enabled state based on settings
    if (typeof drTracker !== 'undefined') {
      drTracker.setEnabled(Settings.DRTrackerEnabled);
    }
  }

  static updateCooldownTracker() {
    // Update cooldown tracker enabled state based on settings
    if (typeof cooldownTracker !== 'undefined') {
      cooldownTracker.setEnabled(Settings.CooldownTrackerEnabled);
      cooldownTracker.setArenaOnly(Settings.CooldownTrackerArenaOnly);
      cooldownTracker.setDebugLogs(Settings.CooldownTrackerDebugLogs);
      cooldownTracker.setVisualThreats(Settings.CooldownTrackerVisualThreats);
    }
  }
}

export default PVP;
