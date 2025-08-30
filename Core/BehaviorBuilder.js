import { Behavior, BehaviorContext } from './Behavior';
import Specialization from '../Enums/Specialization';
import * as bt from './BehaviorTree';
import Settings from "./Settings";
import nuclearWindow from '../GUI/NuclearWindow';
import { enableDebug } from '@/Debug/BehaviorTreeDebug';

const kBehaviorPath = __rootDir + '/behaviors';

export default class BehaviorBuilder {
  async initialize() {
    this.behaviors = await this.collectBehaviors();
  }

  async collectBehaviors() {
    const behaviors = new Array();
    await this.searchDir(kBehaviorPath, behaviors);
    console.log(`Found ${behaviors.length} behaviors`);
    return behaviors;
  }

  build(spec, context) {
    const root = new bt.RunAll("Root");
    const selectedBehaviorName = Settings[`profile${spec}`];

    let behaviors;
    let behaviorSettings = [];

    if (selectedBehaviorName) {
      behaviors = this.behaviors.filter(v => v.name === selectedBehaviorName);
      if (behaviors.length === 0) {
        console.error(`Selected behavior "${selectedBehaviorName}" not found. Falling back to defaults.`);
      } else {
        console.info(`You are using "${selectedBehaviorName}"`);
        behaviorSettings = this.collectBehaviorSettings(behaviors[0]);
      }
    }

    if (!behaviors || behaviors.length === 0) {
      behaviors = this.getComposites(spec, context);

      // If no specific behaviors found for the specialization, fall back to Default behavior
      if (behaviors.length === 0) {
        const defaultBehaviors = this.behaviors.filter(v => v.specialization === Specialization.All && ((v.context & context) === context));
        if (defaultBehaviors.length > 0) {
          behaviors = defaultBehaviors;
          console.info(`No specific behavior found for specialization ${spec}. Using Default behavior.`);
        }
      }
    }

    if (behaviors.length > 0) {
      const selectedBehavior = behaviors[0]; // Assuming we're using the first matching behavior
      behaviorSettings = this.collectBehaviorSettings(selectedBehavior);
    }

    console.debug(`Built ${behaviors.length} composites`);
    behaviors.forEach(v => {
      try {
        const composite = v.build();
        root.addChild(composite);
      } catch(err) {
        console.error(err);
        console.error(err.stack)
      }
    });
    enableDebug(root);

    nuclearWindow.initializeSettings();

    return { root, settings: behaviorSettings };
  }

  getComposites(spec, context) {
    return this.behaviors.filter(v => v.specialization == spec && ((v.context & context) == context));
  }

  async searchDir(path, behaviors) {
    const entries = fs.readdir(path);
    for (const entry of entries) {
      const fullPath = `${entry.parentPath}\\${entry.name}`;
      if (entry.isDirectory) {
        await this.searchDir(fullPath, behaviors);
      } else if (entry.isFile) {
        try {
          const m = await import(fullPath);
          Object.keys(m).forEach(o => {
            if (this.isObjectBehavior(m, o)) {
              const behavior = new m[o]();
              if (this.isValidBehavior(o, behavior)) {
                behaviors.push(behavior);
              }
            }
          });
        } catch (e) {
          console.error(`${fullPath}: ${e}`);
          if (e.stack) {
            console.error(e.stack);
          }
        }
      }
    }
  }

  isClass(cls) {
    return new String(cls).startsWith("class");
  }

  isObjectBehavior(m, o) {
    return this.isClass(m[o]) && (Object.getPrototypeOf(new m[o]()) instanceof Behavior);
  }

  isValidBehavior(name, o) {
    if (o.specialization === undefined) {
      console.error(`Behavior ${name} does not specify specialization`);
      return false;
    }
    if (o.version === undefined) {
      console.error(`Behavior ${name} does not specify game version`);
      return false;
    }
    if (o.specialization == Specialization.Invalid) {
      console.error(`${name} invalid specialization`);
      return false;
    }
    if (!o.build || !(o.build instanceof Function)) {
      console.error(`${name} missing build() function`);
      return false;
    }
    return true;
  }

  collectBehaviorSettings(behavior) {
    try {
      if (behavior.constructor.settings && Array.isArray(behavior.constructor.settings)) {
        const settings = behavior.constructor.settings;
        const flattenedSettings = this.flattenSettings(settings);

        flattenedSettings.forEach(setting => {
          // Only process settings with a defined uid
          if (setting.uid !== undefined) {
            if (Settings[setting.uid] === undefined) {
              Settings[setting.uid] = setting.default;
            }
          }
        });

        return flattenedSettings;
      }
    } catch (error) {
      console.error(`Error collecting behavior settings: ${error.message}`);
    }
    return [];
  }

  flattenSettings(settings) {
    return settings.reduce((acc, setting) => {
      if (setting.options) {
        // If the setting has options, it's a nested structure
        return acc.concat({ header: setting.header }, this.flattenSettings(setting.options));
      } else if (setting.uid) {
        // If the setting has a uid, it's a regular setting
        return acc.concat(setting);
      } else if (setting.header) {
        // If the setting is a header, keep it
        return acc.concat({ header: setting.header });
      }
      // Ignore any other objects that don't have uid or header
      return acc;
    }, []);
  }
}
