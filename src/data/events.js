async function getUpcomingEvents(pool) {
  const query = `
    SELECT
      e.id,
      e.title,
      e.description,
      e.start_time,
      e.location,
      e.capacity,
      (e.capacity - COUNT(r.id))::int AS available_places
    FROM events e
    LEFT JOIN registrations r ON r.event_id = e.id
    WHERE e.start_time > NOW()
    GROUP BY e.id
    ORDER BY e.start_time ASC, e.id ASC
  `;
  const result = await pool.query(query);
  return result.rows;
}

module.exports = { getUpcomingEvents };
