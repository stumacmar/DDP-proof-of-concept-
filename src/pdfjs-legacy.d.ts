// The legacy build is the Node-compatible entry used by the e2e pipeline
// tests; give it the same types as the main package.
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export * from 'pdfjs-dist';
}
