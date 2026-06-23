const {
  AndroidConfig,
  createRunOncePlugin,
  withInfoPlist,
  withPodfileProperties,
} = require('@expo/config-plugins');

const pkg = require('./package.json');

function withDocupassReactNative(config, props = {}) {
  const cameraPermission =
    props.cameraPermission || 'Camera access is required for document and face verification.';

  config = withInfoPlist(config, (innerConfig) => {
    innerConfig.modResults.NSCameraUsageDescription =
      innerConfig.modResults.NSCameraUsageDescription || cameraPermission;
    return innerConfig;
  });

  config = AndroidConfig.Permissions.withPermissions(config, ['android.permission.CAMERA']);

  config = withPodfileProperties(config, (innerConfig) => {
    innerConfig.modResults['ios.useFrameworks'] = 'static';
    innerConfig.modResults['ios.deploymentTarget'] =
      innerConfig.modResults['ios.deploymentTarget'] || '15.0';
    return innerConfig;
  });

  return config;
}

module.exports = createRunOncePlugin(withDocupassReactNative, pkg.name, pkg.version);
