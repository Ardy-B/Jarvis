Test that Jarvis loads and instantiates correctly.

Run: node -e "const {Jarvis}=require('./jarvis');const j=new Jarvis({contentAware:true});console.log('OK — contentAware:', j.contentAware, 'cacheTTL:', j.cacheTTL)"

If it throws, check for syntax errors in jarvis.js.
