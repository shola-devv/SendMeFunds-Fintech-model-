
import request from 'supertest';
import app from '../app';

const testUser = {
  name: 'Test User',
  email: 'test@example.com',
  phone: '08000000000',
  password: 'Password123!',
};

const testWalletPin = '1234';

describe('User routes', () => {
  it('should register a new user', async () => {
    const res = await request(app).post('/api/v1/users/register').send(testUser);
    expect(res.statusCode).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.name).toBe(testUser.name);
    expect(res.body.user.phone).toBe(testUser.phone);
    expect(res.body.user.role).toBe('user');
    // Should not return token in response body (sent in cookies)
    expect(res.body.user.token).toBeUndefined();
  });

  it('should reject registration with missing fields', async () => {
    const res = await request(app).post('/api/v1/users/register').send({
      name: 'Test User',
      email: 'test@example.com',
      // Missing phone and password
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Please provide all required fields');
  });

  it('should reject duplicate email registration', async () => {
    // First registration
    await request(app).post('/api/v1/users/register').send(testUser);

    // Second registration with same email
    const res = await request(app).post('/api/v1/users/register').send(testUser);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Email already registered');
  });

  it('should login an existing user', async () => {
    // First register
    await request(app).post('/api/v1/users/register').send(testUser);

    const res = await request(app).post('/api/v1/users/login').send({
      email: testUser.email,
      password: testUser.password,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.name).toBe(testUser.name);
    expect(res.body.user.role).toBe('user');
    // Should not return token in response body
    expect(res.body.user.token).toBeUndefined();
  });

  it('should reject login with invalid credentials', async () => {
    const res = await request(app).post('/api/v1/users/login').send({
      email: 'nonexistent@example.com',
      password: 'wrongpassword',
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Invalid Credentials');
  });

  it('should reject login with missing fields', async () => {
    const res = await request(app).post('/api/v1/users/login').send({
      email: testUser.email,
      // Missing password
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Please provide email and password');
  });

  it('should update user profile when authenticated', async () => {
    const registerRes = await request(app).post('/api/v1/users/register').send(testUser);
    expect(registerRes.statusCode).toBe(201);

    // Get cookies from registration
    const cookies = registerRes.headers['set-cookie'];

    const res = await request(app)
      .patch('/api/v1/users/updateUser')
      .set('Cookie', cookies)
      .send({
        name: 'Updated Name',
        email: 'updated@example.com',
        phone: '09000000000',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.user.email).toBe('updated@example.com');
    expect(res.body.user.name).toBe('Updated Name');
    expect(res.body.user.phone).toBe('09000000000');
  });

  it('should reject update user without authentication', async () => {
    const res = await request(app)
      .patch('/api/v1/users/updateUser')
      .send({
        name: 'Updated Name',
        email: 'updated@example.com',
        phone: '09000000000',
      });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Not authenticated');
  });

  it('should delete user when authenticated', async () => {
    const registerRes = await request(app).post('/api/v1/users/register').send(testUser);
    expect(registerRes.statusCode).toBe(201);

    const cookies = registerRes.headers['set-cookie'];

    const res = await request(app)
      .delete('/api/v1/users/deleteUser')
      .set('Cookie', cookies);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('User deleted successfully');
  });

  it('should reject delete user without authentication', async () => {
    const res = await request(app).delete('/api/v1/users/deleteUser');

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Not authenticated');
  });

  it('should reject registration with invalid email format', async () => {
    const res = await request(app).post('/api/v1/users/register').send({
      name: 'Test User',
      email: 'invalid-email',
      phone: '08000000000',
      password: 'Password123!',
    });
    expect(res.statusCode).toBe(400);
    // Email validation might be handled by mongoose or additional validation
  });

  it('should reject registration with weak password', async () => {
    const res = await request(app).post('/api/v1/users/register').send({
      name: 'Test User',
      email: 'weakpass@example.com',
      phone: '08000000000',
      password: '123', // Too short
    });
    expect(res.statusCode).toBe(400);
    // Password strength validation might be handled by additional middleware
  });

  it('should reject registration with invalid phone number', async () => {
    const res = await request(app).post('/api/v1/users/register').send({
      name: 'Test User',
      email: 'invalidphone@example.com',
      phone: 'invalid-phone',
      password: 'Password123!',
    });
    expect(res.statusCode).toBe(400);
    // Phone validation might be handled by mongoose or additional validation
  });

  it('should handle concurrent user registrations', async () => {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        request(app).post('/api/v1/users/register').send({
          name: `Concurrent User ${i}`,
          email: `concurrent${i}${Date.now()}@example.com`,
          phone: `0800000000${i}`,
          password: 'Password123!',
        })
      );
    }

    const results = await Promise.all(promises);
    results.forEach(res => {
      expect([200, 201]).toContain(res.statusCode); // Allow for successful registrations
    });
  });

  it('should maintain session after profile update', async () => {
    const registerRes = await request(app).post('/api/v1/users/register').send(testUser);
    expect(registerRes.statusCode).toBe(201);
    const cookies = registerRes.headers['set-cookie'];

    // Update profile
    const updateRes = await request(app)
      .patch('/api/v1/users/updateUser')
      .set('Cookie', cookies)
      .send({
        name: 'Updated Name',
        email: 'updated@example.com',
        phone: '09000000000',
      });
    expect(updateRes.statusCode).toBe(200);

    // Verify session is still valid by accessing protected route
    const walletRes = await request(app)
      .get('/api/v1/wallets')
      .set('Cookie', cookies);
    expect(walletRes.statusCode).toBe(200);
  });

  it('should reject update with empty fields', async () => {
    const registerRes = await request(app).post('/api/v1/users/register').send(testUser);
    expect(registerRes.statusCode).toBe(201);
    const cookies = registerRes.headers['set-cookie'];

    const res = await request(app)
      .patch('/api/v1/users/updateUser')
      .set('Cookie', cookies)
      .send({
        name: '',
        email: '',
        phone: '',
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Please provide all values');
  });

  it('should reject update with existing email', async () => {
    // Create first user
    const user1Res = await request(app).post('/api/v1/users/register').send({
      name: 'User One',
      email: 'user1@example.com',
      phone: '08000000001',
      password: 'Password123!',
    });
    expect(user1Res.statusCode).toBe(201);

    // Create second user
    const user2Res = await request(app).post('/api/v1/users/register').send({
      name: 'User Two',
      email: 'user2@example.com',
      phone: '08000000002',
      password: 'Password123!',
    });
    expect(user2Res.statusCode).toBe(201);
    const cookies = user2Res.headers['set-cookie'];

    // Try to update second user with first user's email
    const res = await request(app)
      .patch('/api/v1/users/updateUser')
      .set('Cookie', cookies)
      .send({
        name: 'User Two Updated',
        email: 'user1@example.com', // Existing email
        phone: '08000000002',
      });

    expect(res.statusCode).toBe(400);
    // Email uniqueness might be handled by mongoose validation
  });

  it('should handle multiple login attempts', async () => {
    // Register user
    await request(app).post('/api/v1/users/register').send(testUser);

    // Multiple login attempts
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/api/v1/users/login').send({
        email: testUser.email,
        password: testUser.password,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.user).toBeDefined();
    }
  });

  it('should handle logout without active session', async () => {
    const res = await request(app).get('/api/v1/users/logout');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Not authenticated');
  });

  it('should prevent access to protected routes after logout', async () => {
    const registerRes = await request(app).post('/api/v1/users/register').send(testUser);
    expect(registerRes.statusCode).toBe(201);
    const cookies = registerRes.headers['set-cookie'];

    // Logout
    const logoutRes = await request(app)
      .get('/api/v1/users/logout')
      .set('Cookie', cookies);
    expect(logoutRes.statusCode).toBe(200);

    // Try to access protected route
    const walletRes = await request(app)
      .get('/api/v1/wallets')
      .set('Cookie', cookies);
    expect(walletRes.statusCode).toBe(401);
  });

  it('should handle malformed JSON in requests', async () => {
    const res = await request(app)
      .post('/api/v1/users/register')
      .set('Content-Type', 'application/json')
      .send('invalid json {');

    expect(res.statusCode).toBe(400);
  });

  it('should handle very long input fields', async () => {
    const longString = 'a'.repeat(1000);
    const res = await request(app).post('/api/v1/users/register').send({
      name: longString,
      email: `test${Date.now()}@example.com`,
      phone: '08000000000',
      password: 'Password123!',
    });

    // Depending on validation, this might succeed or fail
    expect([200, 201, 400]).toContain(res.statusCode);
  });

  it('should handle special characters in name', async () => {
    const res = await request(app).post('/api/v1/users/register').send({
      name: 'Test Üser with spëcial chärs',
      email: `special${Date.now()}@example.com`,
      phone: '08000000000',
      password: 'Password123!',
    });

    expect([200, 201]).toContain(res.statusCode);
  });

  it('should handle SQL injection attempts in email', async () => {
    const res = await request(app).post('/api/v1/users/register').send({
      name: 'Test User',
      email: "'; DROP TABLE users; --",
      phone: '08000000000',
      password: 'Password123!',
    });

    expect(res.statusCode).toBe(400);
  });

  it('should handle XSS attempts in name field', async () => {
    const res = await request(app).post('/api/v1/users/register').send({
      name: '<script>alert("XSS")</script>',
      email: `xss${Date.now()}@example.com`,
      phone: '08000000000',
      password: 'Password123!',
    });

    expect([200, 201]).toContain(res.statusCode);
    // The response should be sanitized
    if (res.statusCode === 201) {
      expect(res.body.user.name).not.toContain('<script>');
    }
  });

describe('Wallet routes', () => {
  let userCookies: string[];
  let userId: string;

  beforeEach(async () => {
    // Register and login user for each test
    const registerRes = await request(app).post('/api/v1/users/register').send({
      ...testUser,
      email: `wallettest${Date.now()}@example.com`, // Unique email
    });
    expect(registerRes.statusCode).toBe(201);
    userCookies = registerRes.headers['set-cookie'];

    // Get user ID from cookies or create wallet to get it
    const walletRes = await request(app)
      .post('/api/v1/wallets')
      .set('Cookie', userCookies)
      .send({ pin: testWalletPin });

    expect(walletRes.statusCode).toBe(201);
    userId = walletRes.body.wallet.userId;
  });

  it('should create wallet with PIN and initial balance', async () => {
    const res = await request(app)
      .post('/api/v1/wallets')
      .set('Cookie', userCookies)
      .send({ pin: testWalletPin });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Wallet created successfully with 1000 NGN initial balance');
    expect(res.body.wallet).toBeDefined();
    expect(res.body.wallet.balance).toBe(1000.0);
    expect(res.body.wallet.currency).toBe('NGN');
    expect(res.body.wallet.userId).toBeDefined();
  });

  it('should reject wallet creation without PIN', async () => {
    const res = await request(app)
      .post('/api/v1/wallets')
      .set('Cookie', userCookies)
      .send({}); // No PIN

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('PIN is required');
  });

  it('should reject duplicate wallet creation', async () => {
    // First wallet creation
    await request(app)
      .post('/api/v1/wallets')
      .set('Cookie', userCookies)
      .send({ pin: testWalletPin });

    // Second attempt
    const res = await request(app)
      .post('/api/v1/wallets')
      .set('Cookie', userCookies)
      .send({ pin: testWalletPin });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Wallet already exists for this user');
  });

  it('should get user wallet', async () => {
    const res = await request(app)
      .get('/api/v1/wallets')
      .set('Cookie', userCookies);

    expect(res.statusCode).toBe(200);
    expect(res.body.wallet).toBeDefined();
    expect(res.body.wallet.balance).toBe(1000.0);
    expect(res.body.wallet.currency).toBe('NGN');
    expect(res.body.wallet.user).toBeDefined();
    expect(res.body.wallet.user.name).toBe(testUser.name);
    expect(res.body.wallet.user.email).toBeDefined();
  });

  it('should reject get wallet without authentication', async () => {
    const res = await request(app).get('/api/v1/wallets');

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Not authenticated');
  });

  it('should fund wallet with correct PIN', async () => {
    const fundAmount = 500.0;

    const res = await request(app)
      .post('/api/v1/wallets/fund')
      .set('Cookie', userCookies)
      .send({
        amount: fundAmount,
        pin: testWalletPin,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Wallet funded successfully');
    expect(res.body.wallet).toBeDefined();
    expect(res.body.wallet.balanceBefore).toBe(1000.0);
    expect(res.body.wallet.balanceAfter).toBe(1500.0);
    expect(res.body.wallet.amount).toBe(fundAmount);
    expect(res.body.wallet.currency).toBe('NGN');
  });

  it('should reject fund wallet with incorrect PIN', async () => {
    const res = await request(app)
      .post('/api/v1/wallets/fund')
      .set('Cookie', userCookies)
      .send({
        amount: 500.0,
        pin: '9999', // Wrong PIN
      });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Invalid PIN');
  });

  it('should reject fund wallet without PIN', async () => {
    const res = await request(app)
      .post('/api/v1/wallets/fund')
      .set('Cookie', userCookies)
      .send({
        amount: 500.0,
        // No PIN
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('PIN is required');
  });

  it('should reject fund wallet with invalid amount', async () => {
    const res = await request(app)
      .post('/api/v1/wallets/fund')
      .set('Cookie', userCookies)
      .send({
        amount: -100.0, // Negative amount
        pin: testWalletPin,
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid amount');
  });

  it('should reject fund wallet without authentication', async () => {
    const res = await request(app)
      .post('/api/v1/wallets/fund')
      .send({
        amount: 500.0,
        pin: testWalletPin,
      });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Not authenticated');
  });

  it('should view audit logs for own wallet', async () => {
    // First create some activity
    await request(app)
      .post('/api/v1/wallets/fund')
      .set('Cookie', userCookies)
      .send({
        amount: 200.0,
        pin: testWalletPin,
      });

    // Get wallet ID
    const walletRes = await request(app)
      .get('/api/v1/wallets')
      .set('Cookie', userCookies);

    const walletId = walletRes.body.wallet.id;

    const res = await request(app)
      .get(`/api/v1/wallets/audit/${walletId}`)
      .set('Cookie', userCookies);

    expect(res.statusCode).toBe(200);
    expect(res.body.walletId).toBe(walletId);
    expect(res.body.totalLogs).toBeGreaterThan(0);
    expect(res.body.logs).toBeDefined();
    expect(Array.isArray(res.body.logs)).toBe(true);

    // Check that logs contain wallet creation and funding
    const actions = res.body.logs.map((log: any) => log.action);
    expect(actions).toContain('wallet_created');
    expect(actions).toContain('fund_wallet');
  });

  it('should reject view audit logs without authentication', async () => {
    const res = await request(app).get('/api/v1/wallets/audit/someWalletId');

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Not authenticated');
  });

  it('should reject view audit logs for wallet not owned by user', async () => {
    // Create another user and wallet
    const otherUserRes = await request(app).post('/api/v1/users/register').send({
      name: 'Other User',
      email: `othertest${Date.now()}@example.com`,
      phone: '08100000000',
      password: 'Password123!',
    });
    expect(otherUserRes.statusCode).toBe(201);

    const otherCookies = otherUserRes.headers['set-cookie'];

    const otherWalletRes = await request(app)
      .post('/api/v1/wallets')
      .set('Cookie', otherCookies)
      .send({ pin: '5678' });

    const otherWalletId = otherWalletRes.body.wallet.id;

    // Try to access other user's wallet audit logs
    const res = await request(app)
      .get(`/api/v1/wallets/audit/${otherWalletId}`)
      .set('Cookie', userCookies);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Forbidden - You do not own this wallet');
  });

  it('should search wallet by email', async () => {
    const res = await request(app)
      .get('/api/v1/wallets/search')
      .set('Cookie', userCookies)
      .query({ email: testUser.email });

    expect(res.statusCode).toBe(200);
    expect(res.body.wallet).toBeDefined();
    expect(res.body.wallet.balance).toBe(1000.0);
    expect(res.body.wallet.currency).toBe('NGN');
  });

  it('should search wallet by phone', async () => {
    const res = await request(app)
      .get('/api/v1/wallets/search')
      .set('Cookie', userCookies)
      .query({ phone: testUser.phone });

    expect(res.statusCode).toBe(200);
    expect(res.body.wallet).toBeDefined();
    expect(res.body.wallet.balance).toBe(1000.0);
  });

  it('should return 404 for non-existent wallet search', async () => {
    const res = await request(app)
      .get('/api/v1/wallets/search')
      .set('Cookie', userCookies)
      .query({ email: 'nonexistent@example.com' });

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('User not found');
  });

  it('should reject wallet search without authentication', async () => {
    const res = await request(app)
      .get('/api/v1/wallets/search')
      .query({ email: testUser.email });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Not authenticated');
  });

  it('should handle wallet creation with very long PIN', async () => {
    const longPin = '1234567890123456789012345678901234567890'; // 40 chars
    const res = await request(app)
      .post('/api/v1/wallets')
      .set('Cookie', userCookies)
      .send({ pin: longPin });

    expect([200, 201, 400]).toContain(res.statusCode);
  });

  it('should handle wallet funding with decimal amounts', async () => {
    const decimalAmount = 123.45;

    const res = await request(app)
      .post('/api/v1/wallets/fund')
      .set('Cookie', userCookies)
      .send({
        amount: decimalAmount,
        pin: testWalletPin,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.wallet.amount).toBe(decimalAmount);
    expect(res.body.wallet.balanceAfter).toBe(1000.0 + decimalAmount);
  });

  it('should handle multiple wallet funding operations', async () => {
    let expectedBalance = 1000.0;

    for (let i = 1; i <= 3; i++) {
      const amount = i * 100.0;
      const res = await request(app)
        .post('/api/v1/wallets/fund')
        .set('Cookie', userCookies)
        .send({
          amount,
          pin: testWalletPin,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.wallet.balanceBefore).toBe(expectedBalance);
      expectedBalance += amount;
      expect(res.body.wallet.balanceAfter).toBe(expectedBalance);
    }

    // Verify final balance
    const walletRes = await request(app)
      .get('/api/v1/wallets')
      .set('Cookie', userCookies);

    expect(walletRes.body.wallet.balance).toBe(1000.0 + 100.0 + 200.0 + 300.0);
  });

  it('should handle wallet funding with very large amounts', async () => {
    const largeAmount = 1000000.0; // 1 million

    const res = await request(app)
      .post('/api/v1/wallets/fund')
      .set('Cookie', userCookies)
      .send({
        amount: largeAmount,
        pin: testWalletPin,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.wallet.amount).toBe(largeAmount);
  });

  it('should handle wallet funding with very small amounts', async () => {
    const smallAmount = 0.01;

    const res = await request(app)
      .post('/api/v1/wallets/fund')
      .set('Cookie', userCookies)
      .send({
        amount: smallAmount,
        pin: testWalletPin,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.wallet.amount).toBe(smallAmount);
  });

  it('should maintain audit trail integrity', async () => {
    // Perform multiple operations
    await request(app)
      .post('/api/v1/wallets/fund')
      .set('Cookie', userCookies)
      .send({
        amount: 100.0,
        pin: testWalletPin,
      });

    await request(app)
      .post('/api/v1/wallets/fund')
      .set('Cookie', userCookies)
      .send({
        amount: 200.0,
        pin: testWalletPin,
      });

    // Get audit logs
    const walletRes = await request(app)
      .get('/api/v1/wallets')
      .set('Cookie', userCookies);

    const walletId = walletRes.body.wallet.id;

    const auditRes = await request(app)
      .get(`/api/v1/wallets/audit/${walletId}`)
      .set('Cookie', userCookies);

    expect(auditRes.statusCode).toBe(200);
    expect(auditRes.body.totalLogs).toBe(3); // creation + 2 funding operations

    // Verify chronological order (newest first)
    const logs = auditRes.body.logs;
    expect(logs[0].action).toBe('fund_wallet');
    expect(logs[0].amount).toBe(200.0);
    expect(logs[1].action).toBe('fund_wallet');
    expect(logs[1].amount).toBe(100.0);
    expect(logs[2].action).toBe('wallet_created');
    expect(logs[2].amount).toBe(1000.0);
  });

  it('should handle wallet search by userId', async () => {
    const walletRes = await request(app)
      .get('/api/v1/wallets')
      .set('Cookie', userCookies);

    const userId = walletRes.body.wallet.userId;

    const res = await request(app)
      .get('/api/v1/wallets/search')
      .set('Cookie', userCookies)
      .query({ userId });

    expect(res.statusCode).toBe(200);
    expect(res.body.wallet).toBeDefined();
    expect(res.body.wallet.balance).toBe(1000.0);
  });

  it('should handle concurrent wallet operations', async () => {
    const promises = [];

    for (let i = 0; i < 5; i++) {
      promises.push(
        request(app)
          .post('/api/v1/wallets/fund')
          .set('Cookie', userCookies)
          .send({
            amount: 10.0,
            pin: testWalletPin,
          })
      );
    }

    const results = await Promise.all(promises);
    results.forEach(res => {
      expect(res.statusCode).toBe(200);
    });

    // Verify final balance
    const walletRes = await request(app)
      .get('/api/v1/wallets')
      .set('Cookie', userCookies);

    expect(walletRes.body.wallet.balance).toBe(1000.0 + 5 * 10.0);
  });

  it('should handle wallet operations with malformed data', async () => {
    const res = await request(app)
      .post('/api/v1/wallets/fund')
      .set('Cookie', userCookies)
      .set('Content-Type', 'application/json')
      .send('{"amount": "not-a-number", "pin": "1234"}');

    expect(res.statusCode).toBe(400);
  });

  it('should handle wallet PIN with special characters', async () => {
    // Create a new user for this test
    const specialUserRes = await request(app).post('/api/v1/users/register').send({
      name: 'Special PIN User',
      email: `specialpin${Date.now()}@example.com`,
      phone: '08200000000',
      password: 'Password123!',
    });
    expect(specialUserRes.statusCode).toBe(201);
    const specialCookies = specialUserRes.headers['set-cookie'];

    const specialPin = 'P@ssw0rd!123';
    const walletRes = await request(app)
      .post('/api/v1/wallets')
      .set('Cookie', specialCookies)
      .send({ pin: specialPin });

    expect(walletRes.statusCode).toBe(201);

    // Test funding with special PIN
    const fundRes = await request(app)
      .post('/api/v1/wallets/fund')
      .set('Cookie', specialCookies)
      .send({
        amount: 100.0,
        pin: specialPin,
      });

    expect(fundRes.statusCode).toBe(200);
  });

  it('should handle wallet balance precision', async () => {
    // Test with amounts that could cause floating point issues
    const amounts = [0.1, 0.2, 0.3, 0.4, 0.5];

    for (const amount of amounts) {
      const res = await request(app)
        .post('/api/v1/wallets/fund')
        .set('Cookie', userCookies)
        .send({
          amount,
          pin: testWalletPin,
        });

      expect(res.statusCode).toBe(200);
      expect(typeof res.body.wallet.balanceAfter).toBe('number');
    }

    // Verify final balance calculation
    const walletRes = await request(app)
      .get('/api/v1/wallets')
      .set('Cookie', userCookies);

    const expectedBalance = 1000.0 + amounts.reduce((sum, amount) => sum + amount, 0);
    expect(walletRes.body.wallet.balance).toBeCloseTo(expectedBalance, 2);
  });
});
