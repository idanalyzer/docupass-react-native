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
  s.source       = { :git => "https://github.com/idanalyzer/docupass-react-native.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.swift_version = "5.9"

  s.dependency "React-Core"
  # The native iOS DocuPass core (wraps MediaPipeTasksVision).
  s.dependency "DocuPass", "~> 0.1"
end
