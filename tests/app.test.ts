
import request from 'supertest';
import app from '../app';

const testUser = {
  name: 'Test User',
  email: 'test@example.com',
  phone: '08000000000',
  password: 'Password123!',
};

describe('User routes', () => {
  it('should register a new user', async () => {
    const res = await request(app).post('/api/v1/users/register').send(testUser);
    expect(res.statusCode).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.token).toBeDefined();
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
    expect(res.body.user.token).toBeDefined();
  });

  it('should update user profile when authenticated', async () => {
    const registerRes = await request(app).post('/api/v1/users/register').send(testUser);
    const token = registerRes.body.user.token;

    const res = await request(app)
      .patch('/api/v1/users/updateUser')
      .set('Cookie', [`accessToken=${token}`])
      .send({
        name: 'Updated Name',
        email: 'updated@example.com',
        phone: '09000000000',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.user.email).toBe('updated@example.com');
  });

  it('should delete user when authenticated', async () => {
    const registerRes = await request(app).post('/api/v1/users/register').send(testUser);
    const token = registerRes.body.user.token;

    const res = await request(app)
      .delete('/api/v1/users/deleteUser')
      .set('Cookie', [`accessToken=${token}`]);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('User deleted successfully');
  });
});
