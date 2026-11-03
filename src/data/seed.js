const bcrypt = require('bcrypt');
const { pool } = require('./db');

async function runSeed() {
  const memberPassword = process.env.DEMO_MEMBER_PASSWORD;
  const organizerPassword = process.env.DEMO_ORGANIZER_PASSWORD;

  if (!memberPassword || !organizerPassword) {
    throw new Error('Demonstration passwords configuration is missing.');
  }

  let client;
  let txStarted = false;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    txStarted = true;

    // 1. Seed or verify users (preserving existing accounts and roles)
    const memberEmail = 'member@club.test';
    const memberRes = await client.query('SELECT id, role FROM users WHERE email = $1', [memberEmail]);
    let memberId;
    if (memberRes.rows.length > 0) {
      const user = memberRes.rows[0];
      if (user.role !== 'member') {
        throw new Error('Demonstration account exists with unexpected role.');
      }
      memberId = user.id;
    } else {
      const memberHash = await bcrypt.hash(memberPassword, 10);
      const insertRes = await client.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
        [memberEmail, memberHash, 'member']
      );
      memberId = insertRes.rows[0].id;
    }

    const organizerEmail = 'organizer@club.test';
    const organizerRes = await client.query('SELECT id, role FROM users WHERE email = $1', [organizerEmail]);
    let organizerId;
    if (organizerRes.rows.length > 0) {
      const user = organizerRes.rows[0];
      if (user.role !== 'organizer') {
        throw new Error('Demonstration account exists with unexpected role.');
      }
      organizerId = user.id;
    } else {
      const organizerHash = await bcrypt.hash(organizerPassword, 10);
      const insertRes = await client.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
        [organizerEmail, organizerHash, 'organizer']
      );
      organizerId = insertRes.rows[0].id;
    }

    // 2. Seed club
    const clubSeedKey = 'club-main';
    const clubRes = await client.query('SELECT id FROM clubs WHERE seed_key = $1', [clubSeedKey]);
    let clubId;
    if (clubRes.rows.length > 0) {
      clubId = clubRes.rows[0].id;
    } else {
      const insertClubRes = await client.query(
        'INSERT INTO clubs (name, description, seed_key) VALUES ($1, $2, $3) RETURNING id',
        ['Campus Club', 'A student club for campus events and activities.', clubSeedKey]
      );
      clubId = insertClubRes.rows[0].id;
    }

    // 3. Seed events (7, 14, 21 days in future when first inserted)
    const eventSeeds = [
      {
        seedKey: 'event-welcome',
        title: 'Welcome Social',
        description: 'Kick off the semester with games, snacks, and meeting fellow members.',
        location: 'Student Union Hall A',
        capacity: 50,
        daysOffset: 7
      },
      {
        seedKey: 'event-workshop',
        title: 'Web Dev Workshop',
        description: 'Learn the fundamentals of building robust web applications.',
        location: 'Computer Lab 3',
        capacity: 30,
        daysOffset: 14
      },
      {
        seedKey: 'event-hackathon',
        title: 'Weekend Hackathon',
        description: 'Build cool projects in teams over an exciting weekend.',
        location: 'Innovation Center',
        capacity: 40,
        daysOffset: 21
      }
    ];

    for (const ev of eventSeeds) {
      const evRes = await client.query('SELECT id FROM events WHERE seed_key = $1', [ev.seedKey]);
      if (evRes.rows.length === 0) {
        await client.query(
          `INSERT INTO events (club_id, organizer_id, title, description, start_time, location, capacity, seed_key)
           VALUES ($1, $2, $3, $4, NOW() + make_interval(days => $5), $6, $7, $8)`,
          [clubId, organizerId, ev.title, ev.description, ev.daysOffset, ev.location, ev.capacity, ev.seedKey]
        );
      }
    }

    await client.query('COMMIT');
    txStarted = false;
    console.log('Seeding completed successfully.');
  } catch (err) {
    if (txStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      txStarted = false;
    }
    if (err.message === 'Demonstration account exists with unexpected role.') {
      throw err;
    }
    throw new Error('Seeding failed.');
  } finally {
    if (client) {
      try {
        client.release();
      } catch {
        // ignore release error
      }
    }
    try {
      await pool.end();
    } catch {
      // ignore pool end error
    }
  }
}

if (require.main === module) {
  runSeed().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

module.exports = { runSeed };
