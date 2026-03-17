import request from 'supertest';
import app from '../app';
import User from '../models/User';
import Wallet from '../models/wallet';
import AuditLog from '../models/auditLog';

describe('Wallet Management Flow', () => {
  let authToken: string;
  let userId: string;
  let walletId: string;

  const testUser = {
    name: 'Wallet User',
    email: 'wallet@example.com',
    phone: '08000000000',
    password: 'Password123!',
  };

  beforeEach(async () => {
    // Register and login user
    const registerRes = await request(app)
      .post('/api/v1/users/register')
      .send(testUser);

    const setCookie = registerRes.headers['set-cookie'];
    if (setCookie && Array.isArray(setCookie)) {
      const accessTokenCookie = setCookie.find((c: string) => c.includes('accessToken'));
      authToken = accessTokenCookie?.split(';')[0].split('=')[1] || '';
    }

    const user = await User.findOne({ email: testUser.email });
    userId = user?._id.toString() || '';
  });

  describe('POST /api/v1/wallets - Create Wallet', () => {
    it('should create wallet with initial 1000 NGN balance', async () => {
      const res = await request(app)
        .post('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ pin: '1234' });

      expect(res.statusCode).toBe(201);
      expect(res.body.wallet).toBeDefined();
      expect(res.body.wallet.balance).toBe(1000);
      expect(res.body.wallet.currency).toBe('NGN');
      walletId = res.body.wallet.id;
    });

    it('should require PIN for wallet creation', async () => {
      const res = await request(app)
        .post('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('PIN');
    });

    it('should reject wallet creation without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/wallets')
        .send({ pin: '1234' });

      expect(res.statusCode).toBe(401);
    });

    it('should prevent duplicate wallet creation for same user', async () => {
      // Create first wallet
      await request(app)
        .post('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ pin: '1234' });

      // Try to create second wallet
      const res = await request(app)
        .post('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ pin: '5678' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('already exists');
    });

    it('should create audit log entry for wallet creation', async () => {
      await request(app)
        .post('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ pin: '1234' });

      const wallet = await Wallet.findOne({ userId });
      const auditLog = await AuditLog.findOne({ walletId: wallet?._id, action: 'wallet_created' });

      expect(auditLog).toBeDefined();
      expect(auditLog?.amount).toBe(1000);
      expect(auditLog?.status).toBe('success');
    });

    it('should hash PIN before storing', async () => {
      const res = await request(app)
        .post('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ pin: '1234' });

      walletId = res.body.wallet.id;
      const wallet = await Wallet.findById(walletId);

      expect(wallet?.pin).not.toBe('1234');
      expect(wallet?.pin).toBeDefined();
    });
  });

  describe('GET /api/v1/wallets - Get Wallet', () => {
    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ pin: '1234' });
      walletId = res.body.wallet.id;
    });

    it('should retrieve wallet for authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`]);

      expect(res.statusCode).toBe(200);
      expect(res.body.wallet).toBeDefined();
      expect(res.body.wallet.balance).toBe(1000);
      expect(res.body.wallet.currency).toBe('NGN');
    });

    it('should reject wallet retrieval without authentication', async () => {
      const res = await request(app).get('/api/v1/wallets');

      expect(res.statusCode).toBe(401);
    });

    it('should include user details in wallet response', async () => {
      const res = await request(app)
        .get('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`]);

      expect(res.body.wallet.user).toBeDefined();
      expect(res.body.wallet.user.name).toBe(testUser.name);
      expect(res.body.wallet.user.email).toBe(testUser.email);
    });
  });

  describe('GET /api/v1/wallets/search - Search Wallet', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ pin: '1234' });
    });

    it('should find wallet by userId', async () => {
      const res = await request(app)
        .get(`/api/v1/wallets/search?userId=${userId}`)
        .set('Cookie', [`accessToken=${authToken}`]);

      expect(res.statusCode).toBe(200);
      expect(res.body.wallet).toBeDefined();
      expect(res.body.wallet.balance).toBe(1000);
    });

    it('should find wallet by email', async () => {
      const res = await request(app)
        .get(`/api/v1/wallets/search?email=${testUser.email}`)
        .set('Cookie', [`accessToken=${authToken}`]);

      expect(res.statusCode).toBe(200);
      expect(res.body.wallet).toBeDefined();
    });

    it('should reject search without authentication', async () => {
      const res = await request(app)
        .get(`/api/v1/wallets/search?userId=${userId}`);

      expect(res.statusCode).toBe(401);
    });

    it('should return 404 for non-existent wallet', async () => {
      const res = await request(app)
        .get(`/api/v1/wallets/search?email=nonexistent@example.com`)
        .set('Cookie', [`accessToken=${authToken}`]);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('POST /api/v1/wallets/fund - Fund Wallet', () => {
    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ pin: '1234' });
      walletId = res.body.wallet.id;
    });

    it('should fund wallet with correct PIN', async () => {
      const res = await request(app)
        .post('/api/v1/wallets/fund')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ amount: 500, pin: '1234' });

      expect(res.statusCode).toBe(200);
      expect(res.body.wallet).toBeDefined();
      expect(res.body.wallet.balanceBefore).toBe(1000);
      expect(res.body.wallet.balanceAfter).toBe(1500);
      expect(res.body.wallet.amount).toBe(500);
    });

    it('should reject fund with incorrect PIN', async () => {
      const res = await request(app)
        .post('/api/v1/wallets/fund')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ amount: 500, pin: '9999' });

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain('PIN');
    });

    it('should reject fund without PIN', async () => {
      const res = await request(app)
        .post('/api/v1/wallets/fund')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ amount: 500 });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('PIN');
    });

    it('should reject invalid amount', async () => {
      const res = await request(app)
        .post('/api/v1/wallets/fund')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ amount: -500, pin: '1234' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Invalid amount');
    });

    it('should create audit log for fund transaction', async () => {
      await request(app)
        .post('/api/v1/wallets/fund')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ amount: 500, pin: '1234' });

      const wallet = await Wallet.findOne({ userId });
      const auditLog = await AuditLog.findOne({
        walletId: wallet?._id,
        action: 'fund_wallet',
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.amount).toBe(500);
      expect(auditLog?.status).toBe('success');
    });

    it('should reject fund without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/wallets/fund')
        .send({ amount: 500, pin: '1234' });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/wallets/audit/:walletId - View Audit Logs', () => {
    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ pin: '1234' });
      walletId = res.body.wallet.id;

      // Create some audit log entries
      await request(app)
        .post('/api/v1/wallets/fund')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ amount: 500, pin: '1234' });

      await request(app)
        .post('/api/v1/wallets/fund')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ amount: 250, pin: '1234' });
    });

    it('should retrieve audit logs for user wallet', async () => {
      const res = await request(app)
        .get(`/api/v1/wallets/audit/${walletId}`)
        .set('Cookie', [`accessToken=${authToken}`]);

      expect(res.statusCode).toBe(200);
      expect(res.body.logs).toBeDefined();
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.logs.length).toBeGreaterThan(0);
    });

    it('should show audit logs in reverse chronological order', async () => {
      const res = await request(app)
        .get(`/api/v1/wallets/audit/${walletId}`)
        .set('Cookie', [`accessToken=${authToken}`]);

      const logs = res.body.logs;
      if (logs.length > 1) {
        const firstTimestamp = new Date(logs[0].timestamp).getTime();
        const secondTimestamp = new Date(logs[1].timestamp).getTime();
        expect(firstTimestamp).toBeGreaterThanOrEqual(secondTimestamp);
      }
    });

    it('should prevent access to other users audit logs', async () => {
      // Create another user
      const otherUser = {
        name: 'Other User',
        email: 'other@example.com',
        phone: '08000000001',
        password: 'Password123!',
      };

      const otherRes = await request(app)
        .post('/api/v1/users/register')
        .send(otherUser);

      const otherSetCookie = otherRes.headers['set-cookie'];
      let otherToken = '';
      if (otherSetCookie && Array.isArray(otherSetCookie)) {
        const accessTokenCookie = otherSetCookie.find((c: string) => c.includes('accessToken'));
        otherToken = accessTokenCookie?.split(';')[0].split('=')[1] || '';
      }

      // Try to access first user's audit logs
      const res = await request(app)
        .get(`/api/v1/wallets/audit/${walletId}`)
        .set('Cookie', [`accessToken=${otherToken}`]);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('should reject audit log access without authentication', async () => {
      const res = await request(app).get(`/api/v1/wallets/audit/${walletId}`);

      expect(res.statusCode).toBe(401);
    });
  });

  describe('Wallet Balance & Transaction Tests', () => {
    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ pin: '1234' });
      walletId = res.body.wallet.id;
    });

    it('should maintain accurate balance after multiple funds', async () => {
      await request(app)
        .post('/api/v1/wallets/fund')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ amount: 100, pin: '1234' });

      await request(app)
        .post('/api/v1/wallets/fund')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ amount: 200, pin: '1234' });

      const res = await request(app)
        .get('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`]);

      expect(res.body.wallet.balance).toBe(1300); // 1000 + 100 + 200
    });

    it('should handle float balance calculations', async () => {
      await request(app)
        .post('/api/v1/wallets/fund')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ amount: 0.5, pin: '1234' });

      const res = await request(app)
        .get('/api/v1/wallets')
        .set('Cookie', [`accessToken=${authToken}`]);

      expect(res.body.wallet.balance).toBe(1000.5);
    });

    it('should verify wallet exists in database with correct data type for balance', async () => {
      const wallet = await Wallet.findById(walletId);
      expect(wallet?.balance).toBe(1000);
      expect(typeof wallet?.balance).toBe('number');
    });
  });
});
