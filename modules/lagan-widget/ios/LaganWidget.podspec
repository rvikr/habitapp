Pod::Spec.new do |s|
  s.name           = 'LaganWidget'
  s.version        = '0.2.0'
  s.summary        = 'Shared storage bridge for the Lagan home-screen widget'
  s.description    = 'Writes backward-compatible widget snapshots and scoped action credentials.'
  s.license        = { :type => 'MIT' }
  s.author         = { 'Lagan' => 'support@lagan.health' }
  s.homepage       = 'https://lagan.health'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.dependency 'ExpoModulesCore'
end
