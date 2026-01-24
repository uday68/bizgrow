import { initDatabase, getDatabase } from './database/init.js';
import { PasswordManager } from './middleware/auth.js';

async function seedUsers() {
  try {
    await initDatabase();
    const db = getDatabase();

    // Demo users to create
    const users = [
      {
        email: 'admin@bizgrow.ai',
        password: 'Admin123!',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin'
      },
      {
        email: 'developer@bizgrow.ai',
        password: 'Developer123!',
        firstName: 'Developer',
        lastName: 'User',
        role: 'developer'
      },
      {
        email: 'user@bizgrow.ai',
        password: 'User123!',
        firstName: 'Regular',
        lastName: 'User',
        role: 'user'
      }
    ];

    console.log('🌱 Seeding demo users...');

    for (const userData of users) {
      // Check if user already exists
      const existingUser = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM users WHERE email = ?', [userData.email], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (existingUser) {
        console.log(`⚠️  User ${userData.email} already exists, skipping...`);
        continue;
      }

      // Hash password
      const passwordHash = await PasswordManager.hashPassword(userData.password);

      // Create user
      await new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO users (email, password_hash, first_name, last_name, role, created_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [userData.email, passwordHash, userData.firstName, userData.lastName, userData.role], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });

      console.log(`✅ Created ${userData.role} user: ${userData.email}`);
    }

    console.log('\n🎉 Demo users seeded successfully!');
    console.log('\n📋 Demo Credentials:');
    console.log('Admin: admin@bizgrow.ai / Admin123!');
    console.log('Developer: developer@bizgrow.ai / Developer123!');
    console.log('User: user@bizgrow.ai / User123!');

  } catch (error) {
    console.error('❌ Error seeding users:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedUsers().then(() => process.exit(0));
}

export { seedUsers };