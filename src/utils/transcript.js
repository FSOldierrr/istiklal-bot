const { ChannelType } = require('discord.js');
const { createTranscript } = require('discord-html-transcripts');
const fs = require('fs');
const path = require('path');
const { log } = require('./helpers');

class TranscriptGenerator {
  constructor() {
    this.tempDir = path.join(__dirname, '..', '..', 'data', 'transcripts');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Generate HTML transcript for a ticket channel
   * @param {TextChannel} channel - Ticket channel
   * @param {Object} ticket - Ticket info from database
   * @param {User} closer - User who closed the ticket
   * @returns {Promise<{buffer: Buffer, filename: string}>}
   */
  async generate(channel, ticket, closer) {
    try {
      const messages = await this.fetchAllMessages(channel);
      
      const attachment = await createTranscript(channel, {
        limit: messages.length,
        returnType: 'attachment',
        fileName: `ticket-${ticket.id.toString().padStart(4, '0')}-${ticket.user_id}.html`,
        saveImages: true,
        poweredBy: false,
        headerIcon: channel.guild.iconURL({ dynamic: true, size: 128 }) || 'https://discord.com/assets/dd4dbc0016779df1378e7812eabaa04d.png',
        timezone: 'Europe/Istanbul',
        locale: 'tr-TR',
        filename: `ticket-${ticket.id.toString().padStart(4, '0')}-${ticket.user_id}.html`,
        customHTML: this.getCustomHTML(ticket, closer)
      });

      return {
        buffer: attachment.attachment,
        filename: attachment.name
      };
    } catch (error) {
      log('error', 'Transkript oluşturma hatası', { error: error.message, channelId: channel.id });
      throw error;
    }
  }

  /**
   * Fetch all messages from channel (with pagination)
   * @param {TextChannel} channel - Channel to fetch from
   * @returns {Promise<Message[]>}
   */
  async fetchAllMessages(channel) {
    const messages = [];
    let lastId = null;
    
    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;
      
      const fetched = await channel.messages.fetch(options);
      if (fetched.size === 0) break;
      
      messages.push(...fetched.values());
      lastId = fetched.last().id;
      
      if (fetched.size < 100) break;
    }
    
    return messages.reverse();
  }

  /**
   * Custom HTML template for transcript
   * @param {Object} ticket - Ticket info
   * @param {User} closer - Closer user
   * @returns {string}
   */
  getCustomHTML(ticket, closer) {
    return `
      <div class="transcript-header">
        <div class="ticket-info">
          <h1>🎫 Ticket #${ticket.id.toString().padStart(4, '0')}</h1>
          <div class="ticket-meta">
            <span class="badge badge-type">${this.escapeHtml(ticket.type)}</span>
            <span class="badge badge-status status-${ticket.status}">${this.getStatusLabel(ticket.status)}</span>
          </div>
        </div>
        <div class="ticket-details">
          <div class="detail-row">
            <span class="label">👤 Açan:</span>
            <span class="value" data-user="${ticket.user_id}">${this.escapeHtml(ticket.user_id)}</span>
          </div>
          <div class="detail-row">
            <span class="label">🔨 Kapatran:</span>
            <span class="value" data-user="${closer.id}">${this.escapeHtml(closer.tag)}</span>
          </div>
          <div class="detail-row">
            <span class="label">👮 Üstlenen:</span>
            <span class="value">${ticket.claimed_by ? `<span data-user="${ticket.claimed_by}">${this.escapeHtml(ticket.claimed_by)}</span>` : 'Yok'}</span>
          </div>
          <div class="detail-row">
            <span class="label">📅 Oluşturulma:</span>
            <span class="value">${new Date(ticket.created_at * 1000).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</span>
          </div>
          <div class="detail-row">
            <span class="label">📅 Kapanış:</span>
            <span class="value">${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</span>
          </div>
        </div>
      </div>
      <style>
        .transcript-header {
          background: linear-gradient(135deg, #2c2f33 0%, #23272a 100%);
          border-radius: 8px 8px 0 0;
          padding: 24px;
          margin: -16px -16px 24px -16px;
          border-bottom: 2px solid #9b59b6;
        }
        .ticket-info h1 {
          color: #fff;
          margin: 0 0 12px 0;
          font-size: 1.5rem;
          font-weight: 600;
        }
        .ticket-meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .badge {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }
        .badge-type {
          background: #9b59b6;
          color: white;
        }
        .badge-status {
          background: #2ecc71;
          color: white;
        }
        .badge-status.status-closed {
          background: #e74c3c;
        }
        .badge-status.status-claimed {
          background: #f39c12;
        }
        .ticket-details {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          margin-top: 16px;
        }
        .detail-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .detail-row .label {
          color: #b9bbbe;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .detail-row .value {
          color: #fff;
          font-size: 0.9rem;
          word-break: break-all;
        }
        @media (max-width: 600px) {
          .ticket-details {
            grid-template-columns: 1fr;
          }
        }
      </style>
    `;
  }

  /**
   * Get status label in Turkish
   * @param {string} status - Status
   * @returns {string}
   */
  getStatusLabel(status) {
    const labels = {
      open: 'Açık',
      claimed: 'Üstlenildi',
      closed: 'Kapalı'
    };
    return labels[status] || status;
  }

  /**
   * Escape HTML special characters
   * @param {string} text - Text to escape
   * @returns {string}
   */
  escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Save transcript buffer to file
   * @param {Buffer} buffer - Transcript buffer
   * @param {string} filename - Filename
   * @returns {Promise<string>} - File path
   */
  async saveToFile(buffer, filename) {
    const filePath = path.join(this.tempDir, filename);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }

  /**
   * Clean up old transcript files
   * @param {number} maxAgeHours - Max age in hours
   */
  cleanup(maxAgeHours = 24) {
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    
    try {
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (e) {
      log('warn', 'Transkript temizleme hatası', { error: e.message });
    }
  }
}

module.exports = new TranscriptGenerator();