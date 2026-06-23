require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "DocupassReactNative"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/idanalyzer/docupass-react-native"
  s.license      = { :type => "MIT", :file => "LICENSE" }
  s.authors      = { "ID Analyzer" => "support@idanalyzer.com" }
  s.platforms    = { :ios => "15.0" }
  s.source       = { :git => "https://github.com/idanalyzer/docupass-react-native.git", :tag => "v#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.swift_version = "5.9"
  s.static_framework = true
  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/Headers/Public/React-Core\" \"$(PODS_ROOT)/Headers/Private/React-Core\""
  }

  s.dependency "React-Core"
  s.dependency "DocuPass", "~> 0.2"
end
