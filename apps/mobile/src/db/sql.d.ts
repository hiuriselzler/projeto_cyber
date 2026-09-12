// Drizzle's generated migrations import .sql files, which babel-plugin-inline-import turns into strings.
declare module '*.sql' {
  const statements: string;
  export default statements;
}
