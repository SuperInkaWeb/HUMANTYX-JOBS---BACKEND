const pool = require("../db");

async function createNotification(
  client,
  {
    userId,
    type,
    title,
    message,
    link = null,
    applicationId = null,
    jobId = null,
  }
) {
  if (!userId) return;

  await client.query(
    `
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      link,
      application_id,
      job_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [userId, type, title, message, link, applicationId, jobId]
  );
}

async function getOrCreateConversation(client, applicationId, createdByUserId) {
  const existing = await client.query(
    `
    SELECT id, application_id, created_by_user_id, status, created_at, updated_at
    FROM application_conversations
    WHERE application_id = $1
    LIMIT 1
    `,
    [applicationId]
  );

  if (existing.rows.length) {
    return existing.rows[0];
  }

  const created = await client.query(
    `
    INSERT INTO application_conversations (
      application_id,
      created_by_user_id,
      status
    )
    VALUES ($1, $2, 'OPEN')
    RETURNING id, application_id, created_by_user_id, status, created_at, updated_at
    `,
    [applicationId, createdByUserId]
  );

  return created.rows[0];
}

async function ensureMessagingAllowed(client, applicationId) {
  const result = await client.query(
    `
    SELECT
      a.id AS application_id,
      a.status AS application_status,
      a.candidate_id,
      a.job_id,
      j.title AS job_title,
      j.status AS job_status,
      j.created_by
    FROM job_applications a
    JOIN jobs j
      ON j.id = a.job_id
    WHERE a.id = $1
    LIMIT 1
    `,
    [applicationId]
  );

  if (!result.rows.length) {
    return {
      ok: false,
      status: 404,
      body: { message: "Postulación no encontrada" },
    };
  }

  const row = result.rows[0];

  if (row.job_status === "DRAFT") {
    return {
      ok: false,
      status: 409,
      body: {
        message: "La mensajería no está disponible para vacantes en borrador.",
      },
    };
  }

  if (row.application_status === "REJECTED") {
    return {
      ok: false,
      status: 409,
      body: {
        message:
          "La mensajería no está disponible para postulaciones no seleccionadas.",
      },
    };
  }

  if (row.application_status === "HIRED") {
    return {
      ok: false,
      status: 409,
      body: {
        message:
          "La mensajería no está disponible para postulaciones contratadas.",
      },
    };
  }

  return { ok: true, row };
}

exports.listMessagesForStaff = async (req, res) => {
  try {
    const applicationId = req.params.id;

    const availability = await ensureMessagingAllowed(pool, applicationId);

    const appInfoResult = await pool.query(
      `
      SELECT
        a.id AS application_id,
        a.status AS application_status,
        a.candidate_id,
        a.job_id,
        j.title AS job_title,
        u.email AS candidate_email,
        up.first_name,
        up.last_name
      FROM job_applications a
      JOIN jobs j
        ON j.id = a.job_id
      JOIN users u
        ON u.id = a.candidate_id
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      WHERE a.id = $1
      LIMIT 1
      `,
      [applicationId]
    );

    if (!appInfoResult.rows.length) {
      return res.status(404).json({ message: "Postulación no encontrada" });
    }

    const application = appInfoResult.rows[0];

    const conversationResult = await pool.query(
      `
      SELECT
        id,
        application_id,
        created_by_user_id,
        status,
        created_at,
        updated_at
      FROM application_conversations
      WHERE application_id = $1
      LIMIT 1
      `,
      [applicationId]
    );

    const result = await pool.query(
      `
      SELECT
        m.id,
        m.conversation_id,
        m.sender_user_id,
        m.sender_role,
        m.message_text,
        m.created_at,
        m.read_by_candidate_at,
        m.read_by_staff_at,

        u.email AS sender_email,
        up.first_name AS sender_first_name,
        up.last_name AS sender_last_name,
        CASE
          WHEN up.first_name IS NOT NULL OR up.last_name IS NOT NULL
            THEN TRIM(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, ''))
          ELSE u.email
        END AS sender_label
      FROM application_messages m
      JOIN application_conversations c
        ON c.id = m.conversation_id
      JOIN users u
        ON u.id = m.sender_user_id
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      WHERE c.application_id = $1
      ORDER BY m.created_at ASC
      `,
      [applicationId]
    );

    await pool.query(
      `
      UPDATE application_messages
      SET read_by_staff_at = NOW()
      WHERE conversation_id IN (
        SELECT id
        FROM application_conversations
        WHERE application_id = $1
      )
        AND sender_role = 'CANDIDATE'
        AND read_by_staff_at IS NULL
      `,
      [applicationId]
    );

    return res.json({
      conversation: conversationResult.rows[0] || null,
      messages: result.rows,
      permissions: {
        can_send: availability.ok,
      },
      application,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error listando mensajes" });
  }
};

exports.sendMessageFromStaff = async (req, res) => {
  const client = await pool.connect();

  try {
    const applicationId = req.params.id;
    const senderUserId = req.user.id;
    const senderRole = req.user.role;
    const messageText = String(req.body?.message_text || "").trim();

    if (!messageText) {
      return res.status(400).json({ message: "El mensaje es obligatorio" });
    }

    await client.query("BEGIN");

    const availability = await ensureMessagingAllowed(client, applicationId);
    if (!availability.ok) {
      await client.query("ROLLBACK");
      return res.status(availability.status).json(availability.body);
    }

    const { candidate_id, job_id, job_title } = availability.row;

    const conversation = await getOrCreateConversation(
      client,
      applicationId,
      senderUserId
    );

    const insert = await client.query(
      `
      INSERT INTO application_messages (
        conversation_id,
        sender_user_id,
        sender_role,
        message_text,
        read_by_candidate_at,
        read_by_staff_at
      )
      VALUES ($1, $2, $3, $4, NULL, NOW())
      RETURNING *
      `,
      [conversation.id, senderUserId, senderRole, messageText]
    );

    const message = insert.rows[0];

    const hydrated = await client.query(
      `
      SELECT
        m.id,
        m.conversation_id,
        m.sender_user_id,
        m.sender_role,
        m.message_text,
        m.created_at,
        m.read_by_candidate_at,
        m.read_by_staff_at,

        u.email AS sender_email,
        up.first_name AS sender_first_name,
        up.last_name AS sender_last_name,
        CASE
          WHEN up.first_name IS NOT NULL OR up.last_name IS NOT NULL
            THEN TRIM(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, ''))
          ELSE u.email
        END AS sender_label
      FROM application_messages m
      JOIN users u
        ON u.id = m.sender_user_id
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      WHERE m.id = $1
      LIMIT 1
      `,
      [message.id]
    );

    await createNotification(client, {
      userId: candidate_id,
      type: "NEW_MESSAGE",
      title: "Nuevo mensaje recibido",
      message: `Recibiste un nuevo mensaje en tu postulación para la vacante ${job_title}.`,
      link: `/mis-postulaciones`,
      applicationId,
      jobId: job_id,
    });

    await client.query(
      `
      UPDATE application_conversations
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [conversation.id]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      message: hydrated.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: "Error enviando mensaje" });
  } finally {
    client.release();
  }
};

exports.listMessagesForCandidate = async (req, res) => {
  try {
    const applicationId = req.params.id;
    const candidateId = req.user.id;

    const ownership = await pool.query(
      `
      SELECT id
      FROM job_applications
      WHERE id = $1
        AND candidate_id = $2
      LIMIT 1
      `,
      [applicationId, candidateId]
    );

    if (!ownership.rows.length) {
      return res.status(403).json({
        message: "No tienes permiso para ver estos mensajes",
      });
    }

    const availability = await ensureMessagingAllowed(pool, applicationId);

    const appInfoResult = await pool.query(
      `
      SELECT
        a.id AS application_id,
        a.status AS application_status,
        a.candidate_id,
        a.job_id,
        j.title AS job_title
      FROM job_applications a
      JOIN jobs j
        ON j.id = a.job_id
      WHERE a.id = $1
      LIMIT 1
      `,
      [applicationId]
    );

    const application = appInfoResult.rows[0] || null;

    const conversationResult = await pool.query(
      `
      SELECT
        id,
        application_id,
        created_by_user_id,
        status,
        created_at,
        updated_at
      FROM application_conversations
      WHERE application_id = $1
      LIMIT 1
      `,
      [applicationId]
    );

    const conversation = conversationResult.rows[0] || null;

    const result = await pool.query(
      `
      SELECT
        m.id,
        m.conversation_id,
        m.sender_user_id,
        m.sender_role,
        m.message_text,
        m.created_at,
        m.read_by_candidate_at,
        m.read_by_staff_at,

        u.email AS sender_email,
        up.first_name AS sender_first_name,
        up.last_name AS sender_last_name,
        CASE
          WHEN up.first_name IS NOT NULL OR up.last_name IS NOT NULL
            THEN TRIM(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, ''))
          ELSE u.email
        END AS sender_label
      FROM application_messages m
      JOIN application_conversations c
        ON c.id = m.conversation_id
      JOIN users u
        ON u.id = m.sender_user_id
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      WHERE c.application_id = $1
      ORDER BY m.created_at ASC
      `,
      [applicationId]
    );

    await pool.query(
      `
      UPDATE application_messages
      SET read_by_candidate_at = NOW()
      WHERE conversation_id IN (
        SELECT id
        FROM application_conversations
        WHERE application_id = $1
      )
        AND sender_role IN ('ADMIN', 'RRHH')
        AND read_by_candidate_at IS NULL
      `,
      [applicationId]
    );

    return res.json({
      conversation,
      messages: result.rows,
      permissions: {
        can_send: availability.ok && !!conversation,
      },
      application,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error listando mensajes" });
  }
};

exports.replyMessageAsCandidate = async (req, res) => {
  const client = await pool.connect();

  try {
    const applicationId = req.params.id;
    const senderUserId = req.user.id;
    const senderRole = req.user.role;
    const messageText = String(req.body?.message_text || "").trim();

    if (!messageText) {
      return res.status(400).json({ message: "El mensaje es obligatorio" });
    }

    const ownership = await client.query(
      `
      SELECT id
      FROM job_applications
      WHERE id = $1
        AND candidate_id = $2
      LIMIT 1
      `,
      [applicationId, senderUserId]
    );

    if (!ownership.rows.length) {
      return res.status(403).json({
        message: "No tienes permiso para responder en esta postulación",
      });
    }

    await client.query("BEGIN");

    const availability = await ensureMessagingAllowed(client, applicationId);
    if (!availability.ok) {
      await client.query("ROLLBACK");
      return res.status(availability.status).json(availability.body);
    }

    const { created_by, job_id, job_title } = availability.row;

    const conversationResult = await client.query(
      `
      SELECT
        id,
        application_id,
        created_by_user_id,
        status,
        created_at,
        updated_at
      FROM application_conversations
      WHERE application_id = $1
      LIMIT 1
      `,
      [applicationId]
    );

    if (!conversationResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "Aún no se ha iniciado una conversación para esta postulación.",
      });
    }

    const conversation = conversationResult.rows[0];

    const insert = await client.query(
      `
      INSERT INTO application_messages (
        conversation_id,
        sender_user_id,
        sender_role,
        message_text,
        read_by_candidate_at,
        read_by_staff_at
      )
      VALUES ($1, $2, $3, $4, NOW(), NULL)
      RETURNING *
      `,
      [conversation.id, senderUserId, senderRole, messageText]
    );

    const message = insert.rows[0];

    const hydrated = await client.query(
      `
      SELECT
        m.id,
        m.conversation_id,
        m.sender_user_id,
        m.sender_role,
        m.message_text,
        m.created_at,
        m.read_by_candidate_at,
        m.read_by_staff_at,

        u.email AS sender_email,
        up.first_name AS sender_first_name,
        up.last_name AS sender_last_name,
        CASE
          WHEN up.first_name IS NOT NULL OR up.last_name IS NOT NULL
            THEN TRIM(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, ''))
          ELSE u.email
        END AS sender_label
      FROM application_messages m
      JOIN users u
        ON u.id = m.sender_user_id
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      WHERE m.id = $1
      LIMIT 1
      `,
      [message.id]
    );

    if (created_by && created_by !== senderUserId) {
      await createNotification(client, {
        userId: created_by,
        type: "NEW_MESSAGE",
        title: "Nuevo mensaje de postulante",
        message: `Recibiste un nuevo mensaje en la vacante ${job_title}.`,
        link: `/rrhh/vacantes/${job_id}/postulantes`,
        applicationId,
        jobId: job_id,
      });
    }

    await client.query(
      `
      UPDATE application_conversations
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [conversation.id]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      message: hydrated.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: "Error respondiendo mensaje" });
  } finally {
    client.release();
  }
};