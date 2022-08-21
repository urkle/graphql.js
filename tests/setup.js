import { beforeEach, afterEach, beforeAll, afterAll, expect } from "vitest";
import { mockServer } from 'tests/mock_server';

beforeEach(() => {
    expect.hasAssertions();
});

// Setup msw
beforeAll(() => mockServer.listen({ onUnhandledRequest: 'error' }));
afterAll(() => mockServer.close());
afterEach(() => mockServer.resetHandlers());
