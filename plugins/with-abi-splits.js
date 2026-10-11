// Lets a release build produce one APK per CPU type (arm64-v8a, armeabi-v7a)
// instead of a single APK carrying both. Off unless the build passes
// -Pbudget.abiSplits=true, so local `expo run:android` builds are unchanged.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// budget-logger: abi splits';
const SPLITS = `
    ${MARKER}
    splits {
        abi {
            enable((findProperty('budget.abiSplits') ?: 'false').toBoolean())
            reset()
            include 'arm64-v8a', 'armeabi-v7a'
            universalApk false
        }
    }
`;

module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, (cfg) => {
    const gradle = cfg.modResults.contents;
    if (!gradle.includes(MARKER)) {
      const anchor = /\n    packagingOptions \{/;
      if (!anchor.test(gradle)) throw new Error('with-abi-splits: packagingOptions block not found in app/build.gradle');
      cfg.modResults.contents = gradle.replace(anchor, `${SPLITS}    packagingOptions {`);
    }
    return cfg;
  });
};
