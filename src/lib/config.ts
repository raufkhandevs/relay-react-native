/**
 * Values with no dependencies of their own.
 *
 * API_BASE lives here rather than in api.ts because echo.ts needs it, and importing
 * it from api.ts created a cycle: auth -> echo -> api -> auth. Metro allows cycles
 * but hands a module a partially initialised binding while one is resolving, which
 * is how `new Echo(...)` ended up being called on an object rather than a class.
 */
export const API_BASE = 'http://localhost:8000';
