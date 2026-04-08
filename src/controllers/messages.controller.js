const pool = require("../db");

const TERMINAL_STATUSES = new Set(["REJECTED", "HIRED"]);

function normalizeMessageText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function canSendMessages(jobStatus, applicationStatus, conversationStatus = "OPEN") {
  if (jobStatus === "DRAFT") return false;
  if (TERMINAL_STATUSES.has(applicationStatus)) return false;
  if (conversationStatus === "CLOSED") return false;

  return true;
}

function getBlockedMessage(jobStatus, applicationStatus, conversationStatus = "OPEN") {
  if (jobStatus === "DRAFT") {
    return "No se permiten mensajes en vacantes en borrador";
  }

  if (TERMINAL_STATUSES.has(applicationStatus)) {
    return "Esta postulación ya no admite mensajes";
  }

  if (conversationStatus === "CLOSED") {
    return "La conversación está cerrada";
  }

  return "No se pueden enviar mensajes en esta postulación";
}

async function getConversationByApplicationId(applicationId, client = pool) {
  const result = await client.query(
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

  return result.rows[0] || null;
}

async function getMessagesByConversationId(conversationId, client = pool) {
  const result = await client.query(
    `
    SELECT
      m.id,
      m.conversation_id,
      m.sender_user_id,
      m.sender_role,
      m.message_text,
      m.read_by_candidate_at,
      m.read_by_staff_at,
      m.created_at,
      u.email AS sender_email,
      CASE
        WHEN m.sender_role = 'CANDIDATE'
          THEN COALESCE(NULLIF(TRIM(CONCAT(p.first_name, ' ', p.last_name)), ''), u.email)
        WHEN m.sender_role IN ('ADMIN', 'RRHH')
          THEN COALESCE(NULLIF(TRIM(CONCAT(p.first_name, ' ', p.last_name)), ''), 'Reclutador')
        ELSE u.email
      END AS sender_label
    FROM application_messages m
    JOIN users u
      ON u.id = m.sender_user_id
    LEFT JOIN candidate_profiles p
      ON p.user_id = u.id
    WHERE m.conversation_id = $1
    ORDER BY m.created_at ASC, m.id ASC
    `,
    [conversationId]
  );

  return result.rows;
}

async function markMessagesReadByStaff(conversationId, client = pool) {
  await client.query(
    `
    UPDATE application_messages
    SET read_by_staff_at = NOW()
    WHERE conversation_id = $1
      AND sender_role = 'CANDIDATE'
      AND read_by_staff_at IS NULL
    `,
    [conversationId]
  );
}

async function markMessagesReadByCandidate(conversationId, client = pool) {
  await client.query(
    `
    UPDATE application_messages
    SET read_by_candidate_at = NOW()
    WHERE conversation_id = $1
      AND sender_role IN ('ADMIN', 'RRHH')
      AND read_by_candidate_at IS NULL
    `,
    [conversationId]
  );
}

async function getStaffApplicationContext(applicationId, client = pool) {
  const result = await client.query(
    `
    SELECT
      a.id AS application_id,
      a.job_id,
      a.candidate_id,
      a.status AS application_status,
      a.created_at AS applied_at,
      j.title AS job_title,
      j.status AS job_status,
      u.email AS candidate_email,
      p.first_name,
      p.last_name
    FROM job_applications a
    JOIN jobs j
      ON j.id = a.job_id
    JOIN users u
      ON u.id = a.candidate_id
    LEFT JOIN candidate_profiles p
      ON p.user_id = u.id
    WHERE a.id = $1
    LIMIT 1
    `,
    [applicationId]
  );

  return result.rows[0] || null;
}

async function getCandidateApplicationContext(applicationId, candidateId, client = pool) {
  const result = await client.query(
    `
    SELECT
      a.id AS application_id,
      a.job_id,
      a.candidate_id,
      a.status AS application_status,
      a.created_at AS applied_at,
      j.title AS job_title,
      j.status AS job_status
    FROM job_applications a
    JOIN jobs j
      ON j.id = a.job_id
    WHERE a.id = $1
      AND a.candidate_id = $2
    LIMIT 1
    `,
    [applicationId, candidateId]
  );

  return result.rows[0] || null;
}

/**
 * GET /admin/applications/:id/messages
 */
exports.listMessagesForStaff = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id: applicationId } = req.params;

    await client.query("BEGIN");

    const application = await getStaffApplicationContext(applicationId, client);

    if (!application) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Postulación no encontrada" });
    }

    const conversation = await getConversationByApplicationId(applicationId, client);

    let messages = [];

    if (conversation) {
      await markMessagesReadByStaff(conversation.id, client);
      messages = await getMessagesByConversationId(conversation.id, client);
    }

    await client.query("COMMIT");

    return res.json({
      application,
      conversation,
      messages,
      permissions: {
        can_send: conversation
    ? canSendMessages(
        application.job_status,
        application.application_status,
        conversation.status
      )
    : canSendMessages(
        application.job_status,
        application.application_status,
        "OPEN"
      ),
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: "Error listando mensajes" });
  } finally {
    client.release();
  }
};

/**
 * POST /admin/applications/:id/messages
 */
exports.sendMessageFromStaff = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id: applicationId } = req.params;
    const messageText = normalizeMessageText(req.body?.message_text);

    if (!messageText) {
      return res.status(400).json({ message: "message_text es requerido" });
    }

    if (messageText.length > 2000) {
      return res
        .status(400)
        .json({ message: "El mensaje no puede superar los 2000 caracteres" });
    }

    const application = await getStaffApplicationContext(applicationId, client);

    if (!application) {
      return res.status(404).json({ message: "Postulación no encontrada" });
    }

    if (!canSendMessages(application.job_status, application.application_status, "OPEN")) {
  return res.status(400).json({
    message: getBlockedMessage(
      application.job_status,
      application.application_status,
      "OPEN"
    ),
  });
}

    await client.query("BEGIN");

    let conversation = await getConversationByApplicationId(applicationId, client);

    if (!conversation) {
      const createdConversation = await client.query(
        `
        INSERT INTO application_conversations (
          application_id,
          created_by_user_id,
          status
        )
        VALUES ($1, $2, 'OPEN')
        RETURNING
          id,
          application_id,
          created_by_user_id,
          status,
          created_at,
          updated_at
        `,
        [applicationId, req.user.id]
      );

      conversation = createdConversation.rows[0];
    }

    if (
        !canSendMessages(
            application.job_status,
            application.application_status,
            conversation.status
        )
        ) {
        await client.query("ROLLBACK");
        return res.status(400).json({
            message: getBlockedMessage(
            application.job_status,
            application.application_status,
            conversation.status
            ),
        });
    }

    const insertedMessage = await client.query(
      `
      INSERT INTO application_messages (
        conversation_id,
        sender_user_id,
        sender_role,
        message_text
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        conversation_id,
        sender_user_id,
        sender_role,
        message_text,
        read_by_candidate_at,
        read_by_staff_at,
        created_at
      `,
      [conversation.id, req.user.id, req.user.role, messageText]
    );

    await client.query(
      `
      UPDATE application_conversations
      SET updated_at = NOW(),
          status = 'OPEN'
      WHERE id = $1
      `,
      [conversation.id]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Mensaje enviado correctamente",
      conversation: {
        ...conversation,
        status: "OPEN",
      },
      sent_message: insertedMessage.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: "Error enviando mensaje" });
  } finally {
    client.release();
  }
};

/**
 * GET /candidate/applications/:id/messages
 */
exports.listMessagesForCandidate = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id: applicationId } = req.params;
    const candidateId = req.user.id;

    await client.query("BEGIN");

    const application = await getCandidateApplicationContext(
      applicationId,
      candidateId,
      client
    );

    if (!application) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Postulación no encontrada" });
    }

    const conversation = await getConversationByApplicationId(applicationId, client);

    let messages = [];

    if (conversation) {
      await markMessagesReadByCandidate(conversation.id, client);
      messages = await getMessagesByConversationId(conversation.id, client);
    }

    await client.query("COMMIT");

    return res.json({
      application,
      conversation,
      messages,
      permissions: {
        can_reply:
            !!conversation &&
            canSendMessages(
                application.job_status,
                application.application_status,
                conversation.status
            ),
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: "Error listando mensajes" });
  } finally {
    client.release();
  }
};

/**
 * POST /candidate/applications/:id/messages/reply
 */
exports.replyMessageAsCandidate = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id: applicationId } = req.params;
    const candidateId = req.user.id;
    const messageText = normalizeMessageText(req.body?.message_text);

    if (!messageText) {
      return res.status(400).json({ message: "message_text es requerido" });
    }

    if (messageText.length > 2000) {
      return res
        .status(400)
        .json({ message: "El mensaje no puede superar los 2000 caracteres" });
    }

    const application = await getCandidateApplicationContext(
      applicationId,
      candidateId,
      client
    );

    if (!application) {
      return res.status(404).json({ message: "Postulación no encontrada" });
    }

    const conversation = await getConversationByApplicationId(applicationId, client);

    if (!conversation) {
      return res.status(403).json({
        message:
          "Aún no tienes una conversación iniciada para esta postulación",
      });
    }

    if (
        !canSendMessages(
            application.job_status,
            application.application_status,
            conversation.status
        )
        ) {
        return res.status(400).json({
            message: getBlockedMessage(
            application.job_status,
            application.application_status,
            conversation.status
            ),
        });
    }

    await client.query("BEGIN");

    const insertedMessage = await client.query(
      `
      INSERT INTO application_messages (
        conversation_id,
        sender_user_id,
        sender_role,
        message_text
      )
      VALUES ($1, $2, 'CANDIDATE', $3)
      RETURNING
        id,
        conversation_id,
        sender_user_id,
        sender_role,
        message_text,
        read_by_candidate_at,
        read_by_staff_at,
        created_at
      `,
      [conversation.id, candidateId, messageText]
    );

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
      message: "Respuesta enviada correctamente",
      conversation,
      sent_message: insertedMessage.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: "Error enviando respuesta" });
  } finally {
    client.release();
  }
};