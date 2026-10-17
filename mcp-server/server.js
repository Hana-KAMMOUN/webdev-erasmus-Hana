const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');

// Load local lecture data once when the server starts.
const lectures = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'lectures.json'),
    'utf8'
  )
);

// Helper function for tool results.
// A tool result contains one text content part and isError.
function textResult(id, text, isError) {
  return {
    jsonrpc: '2.0',
    id: id,
    result: {
      content: [
        {
          type: 'text',
          text: text
        }
      ],
      isError: isError
    }
  };
}

// The tools offered by the MCP server.
const tools = [

  // Required tool
  {
    name: 'find_lecture',

    description:
      'Return the title and topics of one course lecture by its number, from 1 to 10. Use it when asked what a specific lecture covers.',

    inputSchema: {
      type: 'object',

      properties: {
        number: {
          type: 'integer',
          description: 'Lecture number, from 1 to 10'
        }
      },

      required: ['number']
    }
  },


  // Personal tool
  {
    name: 'find_lectures_by_topic',

    description:
      'Find course lectures related to a given topic or keyword. Use it when asked which lectures cover a specific subject.',

    inputSchema: {
      type: 'object',

      properties: {
        topic: {
          type: 'string',
          description: 'Topic or keyword to search for in lecture titles and topics'
        }
      },

      required: ['topic']
    }
  }

];

// Send one JSON-RPC reply on stdout.
// IMPORTANT: stdout must contain only protocol messages.
function send(reply) {
  process.stdout.write(
    JSON.stringify(reply) + '\n'
  );
}

// Handle one MCP / JSON-RPC message.
function handle(msg) {
  // 1. MCP initialization handshake
  if (msg.method === 'initialize') {

    return {
      jsonrpc: '2.0',

      id: msg.id,

      result: {

        protocolVersion: msg.params.protocolVersion,

        capabilities: {
          tools: {}
        },

        serverInfo: {
          name: 'lectures',
          version: '0.1.0'
        }

      }
    };
  }

  // 2. Initialization notification
  if (msg.method === 'notifications/initialized') {
    return null;
  }

  // 3. List tools
  if (msg.method === 'tools/list') {

    return {
      jsonrpc: '2.0',

      id: msg.id,

      result: {
        tools: tools
      }
    };
  }

  // 4. Call a tool
  if (msg.method === 'tools/call') {

    const name = msg.params.name;
    const args = msg.params.arguments || {};


    // Tool 1: find_lecture
    if (name === 'find_lecture') {

      const lecture = lectures.find(
        (l) => l.number === args.number
      );

      // Lecture does not exist.
      // This is a tool failure, NOT a protocol error.
      if (!lecture) {

        return textResult(
          msg.id,

          'There is no lecture ' +
            args.number +
            '. The course has lectures 1 to 10.',

          true
        );
      }

      // Lecture found successfully.
      return textResult(
        msg.id,

        'Lecture ' +
          lecture.number +
          ': ' +
          lecture.title +
          '. Topics: ' +
          lecture.topics,

        false
      );
    }

    // Tool 2: find_lectures_by_topic
    if (name === 'find_lectures_by_topic') {

      // Protect the server if topic is missing.
      if (
        typeof args.topic !== 'string' ||
        args.topic.trim() === ''
      ) {

        return textResult(
          msg.id,
          'Please provide a topic or keyword to search for.',
          true
        );
      }

      const topic = args.topic
        .trim()
        .toLowerCase();

      // Search in both the lecture title and topics.
      const matches = lectures.filter((lecture) => {

        const searchableText =
          String(lecture.title).toLowerCase() +
          ' ' +
          String(lecture.topics).toLowerCase();

        return searchableText.includes(topic);
      });

      // No lecture matches the topic.
      if (matches.length === 0) {

        return textResult(
          msg.id,

          'No lecture found for topic: ' +
            args.topic,

          true
        );
      }

      // Format all matching lectures as text.
      const resultText = matches
        .map(
          (lecture) =>
            'Lecture ' +
            lecture.number +
            ': ' +
            lecture.title +
            '. Topics: ' +
            lecture.topics
        )
        .join('\n');

      return textResult(
        msg.id,
        resultText,
        false
      );
    }

    // Unknown tool
    // This is a protocol error because the client requested a tool that the server never offered.
    return {
      jsonrpc: '2.0',

      id: msg.id,

      error: {
        code: -32602,
        message: 'Unknown tool: ' + name
      }
    };
  }

  // 5. Unknown request method
  if (msg.id !== undefined) {

    return {
      jsonrpc: '2.0',

      id: msg.id,

      error: {
        code: -32601,
        message: 'Unknown method: ' + msg.method
      }
    };
  }

  // Unknown notification:
  // no id -> no reply.

  return null;
}

// Read standard input line by line.
const lines = readline.createInterface({
  input: process.stdin
});

// Handle every received JSON line.
lines.on('line', (line) => {

  // Logs go to stderr, never stdout.
  console.error('got: ' + line);

  const message = JSON.parse(line);

  const reply = handle(message);

  if (reply) {
    send(reply);
  }

});