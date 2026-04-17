const request = require('supertest');
const app = require('../api/index');

describe('API Endpoints', () => {
  test('GET /api/health should return 200 and status ok', async () => {
    const response = await request(app).get('/api/health');
    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  test('GET /api/status should return 200', async () => {
    const response = await request(app).get('/api/status');
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('creditsRemaining');
    expect(response.body).toHaveProperty('isPro');
  });

  test('GET /api/screener should return 200 and normalized data', async () => {
    const response = await request(app).get('/api/screener');
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    if (response.body.length > 0) {
      expect(response.body[0]).toHaveProperty('symbol');
      expect(response.body[0]).toHaveProperty('lastPrice');
    }
  });
});
