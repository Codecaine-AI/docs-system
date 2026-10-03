// Generates the TypeScript client into packages/docs-style/baml_client.
// Run from packages/docs-style: bunx baml-cli generate --from baml_src
generator target {
  output_type "typescript"
  output_dir "../"
  version "0.222.0"
  default_client_mode async
  module_format "esm"
}
