import request from 'supertest';
import app from '../app';
import User from '../models/User';
import Token from '../models/Token';

describe('User Authentication & Profile Flow', () => {
  const testUser = {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '08012345678',
    password: 'SecurePass123!',
  };

  describe('POST /api/v1/users/register', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/v1/users/register')
        .send(testUser);

      expect(res.statusCode).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.name).toBe(testUser.name);
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user.phone).toBe(testUser.phone);
      expect(res.body.user.role).toBe('user');

      // Verify user exists in DB
      const user = await User.findOne({ email: testUser.email });
      expect(user).toBeDefined();
      expect(user?.name).toBe(testUser.name);
    });

    it('should reject registration with missing fields', async () => {
      const res = await request(app)
        .post('/api/v1/users/register')
        .send({ name: 'John', email: 'john@example.com' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should reject duplicate email registration', async () => {
      // Register first user
      await request(app).post('/api/v1/users/register').send(testUser);

      // Try to register with same email
      const res = await request(app)
        .post('/api/v1/users/register')
        .send({ ...testUser, phone: '08098765432' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Email already registered');
    });

    it('should hash password before storing', async () => {
      await request(app).post('/api/v1/users/register').send(testUser);

      const user = await User.findOne({ email: testUser.email });
      expect(user?.password).not.toBe(testUser.password);
      expect(user?.password).toBeDefined();
    });
  });

  describe('POST /api/v1/users/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/users/register').send(testUser);
    });

    it('should login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/users/login')
        .send({ email: testUser.email, password: testUser.password });

      expect(res.statusCode).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);

      // Check if token is set in cookies
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject login with incorrect password', async () => {
      const res = await request(app)
        .post('/api/v1/users/login')
        .send({ email: testUser.email, password: 'WrongPassword123!' });

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain('Invalid Credentials');
    });

    it('should reject login with non-existent email', async () => {
      const res = await request(app)
        .post('/api/v1/users/login')
        .send({ email: 'nonexistent@example.com', password: testUser.password });

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain('Invalid Credentials');
    });

    it('should reject login with missing email or password', async () => {
      const res = await request(app)
        .post('/api/v1/users/login')
        .send({ email: testUser.email });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should create refresh token in database after login', async () => {
      await request(app)
        .post('/api/v1/users/login')
        .send({ email: testUser.email, password: testUser.password });

      const user = await User.findOne({ email: testUser.email });
      const tokenRecord = await Token.findOne({ user: user?._id });

      expect(tokenRecord).toBeDefined();
      expect(tokenRecord?.isValid).toBe(true);
    });
  });

  describe('PATCH /api/v1/users/updateUser', () => {
    let authToken: string;

    beforeEach(async () => {
      const registerRes = await request(app)
        .post('/api/v1/users/register')
        .send(testUser);

      // Extract auth tokens from cookies
      const setCookie = registerRes.headers['set-cookie'];
      if (setCookie && Array.isArray(setCookie)) {
        const accessTokenCookie = setCookie.find((c: string) => c.includes('accessToken'));
        authToken = accessTokenCookie?.split(';')[0].split('=')[1] || '';
      }
    });

    it('should update user profile when authenticated', async () => {
      const updatedData = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '09012345678',
      };

      const res = await request(app)
        .patch('/api/v1/users/updateUser')
        .set('Cookie', [`accessToken=${authToken}`])
        .send(updatedData);

      expect(res.statusCode).toBe(200);
      expect(res.body.user.name).toBe(updatedData.name);
      expect(res.body.user.email).toBe(updatedData.email);
      expect(res.body.user.phone).toBe(updatedData.phone);
    });

    it('should reject profile update without authentication', async () => {
      const res = await request(app)
        .patch('/api/v1/users/updateUser')
        .send({ name: 'Jane Doe', email: 'jane@example.com', phone: '09012345678' });

      expect(res.statusCode).toBe(401);
    });

    it('should reject profile update with missing fields', async () => {
      const res = await request(app)
        .patch('/api/v1/users/updateUser')
        .set('Cookie', [`accessToken=${authToken}`])
        .send({ name: 'Jane Doe' });

      expect(res.statusCode).toBe(400);
    });

    it('should verify updated user in database', async () => {
      const updatedData = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '09012345678',
      };

      await request(app)
        .patch('/api/v1/users/updateUser')
        .set('Cookie', [`accessToken=${authToken}`])
        .send(updatedData);

      const user = await User.findOne({ email: updatedData.email });
      expect(user?.name).toBe(updatedData.name);
    });
  });

  describe('DELETE /api/v1/users/deleteUser', () => {
    let authToken: string;
    let userId: string;

    beforeEach(async () => {
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

    it('should delete user when authenticated', async () => {
      const res = await request(app)
        .delete('/api/v1/users/deleteUser')
        .set('Cookie', [`accessToken=${authToken}`]);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('successfully');
    });

    it('should remove user from database', async () => {
      await request(app)
        .delete('/api/v1/users/deleteUser')
        .set('Cookie', [`accessToken=${authToken}`]);

      const user = await User.findById(userId);
      expect(user).toBeNull();
    });

    it('should invalidate user tokens after deletion', async () => {
      await request(app)
        .delete('/api/v1/users/deleteUser')
        .set('Cookie', [`accessToken=${authToken}`]);

      const tokens = await Token.find({ user: userId });
      expect(tokens.length).toBe(0);
    });

    it('should reject deletion without authentication', async () => {
      const res = await request(app).delete('/api/v1/users/deleteUser');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/users/logout', () => {
    let authToken: string;

    beforeEach(async () => {
      const registerRes = await request(app)
        .post('/api/v1/users/register')
        .send(testUser);

      const setCookie = registerRes.headers['set-cookie'];
      if (setCookie && Array.isArray(setCookie)) {
        const accessTokenCookie = setCookie.find((c: string) => c.includes('accessToken'));
        authToken = accessTokenCookie?.split(';')[0].split('=')[1] || '';
      }
    });

    it('should logout successfully when authenticated', async () => {
      const res = await request(app)
        .get('/api/v1/users/logout')
        .set('Cookie', [`accessToken=${authToken}`]);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('successfully');
    });

    it('should invalidate refresh token on logout', async () => {
      const user = await User.findOne({ email: testUser.email });
      
      await request(app)
        .get('/api/v1/users/logout')
        .set('Cookie', [`accessToken=${authToken}`]);

      const tokenRecord = await Token.findOne({ user: user?._id });
      expect(tokenRecord?.isValid).toBe(false);
    });
  });
});
