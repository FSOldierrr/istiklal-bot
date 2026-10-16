/**
 * Kullanıcının yetkili olup olmadığını kontrol eder
 * @param {GuildMember} member - Kontrol edilecek üye
 * @param {GuildSettings} settings - Sunucu ayarları
 * @returns {boolean}
 */
function isStaff(member, settings) {
  // Sunucu sahibi her zaman yetkilidir
  if (member.guild.ownerId === member.id) return true;
  
  // Yönetici izni olan herkes yetkilidir
  if (member.permissions.has('Administrator')) return true;
  
  // Yetkili rolleri kontrol et
  if (settings.staffRoles && settings.staffRoles.length > 0) {
    return settings.staffRoles.some(roleId => member.roles.cache.has(roleId));
  }
  
  // Yetkili rolü ayarlanmamışsa sadece Yönetici yetkilidir
  return false;
}

/**
 * Kullanıcının belirli bir izinlere sahip olup olmadığını kontrol eder
 * @param {GuildMember} member - Kontrol edilecek üye
 * @param {string[]} permissions - Gerekli izinler
 * @returns {boolean}
 */
function hasPermission(member, permissions) {
  if (member.guild.ownerId === member.id) return true;
  if (member.permissions.has('Administrator')) return true;
  return permissions.every(p => member.permissions.has(p));
}

/**
 * Rol hiyerarşisi kontrolü - hedef kullanıcı yetkili/bottan üstün mü?
 * @param {GuildMember} executor - İşlemi yapan kişi
 * @param {GuildMember|User} target - Hedef kişi
 * @param {Client} client - Bot client
 * @returns {boolean} - true: işlem yapılabilir, false: hiyerarşi engelliyor
 */
function canModerate(executor, target, client) {
  // Sunucu sahibi her şeyi yapabilir
  if (executor.guild.ownerId === executor.id) return true;
  
  // Kendini cezalandıramaz
  if (executor.id === target.id) return false;
  
  // Bot kendisini cezalandıramaz
  if (client.user.id === target.id) return false;
  
  // Hedef sunucu sahibi ise kimse dokunamaz
  if (executor.guild.ownerId === target.id) return false;
  
  // Hedef bir GuildMember değilse (ör. unban) hiyerarşi kontrolü yapılamaz
  if (!target.roles) return true;
  
  // Yetkili rolü en yüksek pozisyon
  const executorHighestRole = executor.roles.highest;
  const targetHighestRole = target.roles.highest;
  
  // Yetkili hedeften üstünde olmalı
  if (executorHighestRole.position <= targetHighestRole.position) return false;
  
  // Bot da hedeften üstünde olmalı
  const botMember = executor.guild.members.me;
  if (botMember.roles.highest.position <= targetHighestRole.position) return false;
  
  return true;
}

/**
 * Botun belirli bir kanalda yetkisi var mı?
 * @param {GuildChannel} channel - Kanal
 * @param {string[]} permissions - Gerekli izinler
 * @returns {boolean}
 */
function botHasPermission(channel, permissions) {
  const botMember = channel.guild.members.me;
  if (!botMember) return false;
  
  const channelPerms = channel.permissionsFor(botMember);
  return permissions.every(p => channelPerms.has(p));
}

/**
 * Ticket yetkisi kontrolü - kullanıcı ticket'ı görebilir mi?
 * @param {GuildMember} member - Kontrol edilecek üye
 * @param {Ticket} ticket - Ticket bilgisi
 * @param {GuildSettings} settings - Sunucu ayarları
 * @returns {boolean}
 */
function canAccessTicket(member, ticket, settings) {
  // Ticket sahibi her zaman erişebilir
  if (member.id === ticket.user_id) return true;
  
  // Yetkililer erişebilir
  if (isStaff(member, settings)) return true;
  
  // Eklenen katılımcılar erişebilir (ileride eklenecek)
  return false;
}

/**
 * Ticket yönetme yetkisi - kapatma, üstlenme, kişi ekleme/çıkarma
 * @param {GuildMember} member - Kontrol edilecek üye
 * @param {Ticket} ticket - Ticket bilgisi
 * @param {GuildSettings} settings - Sunucu ayarları
 * @returns {boolean}
 */
function canManageTicket(member, ticket, settings) {
  // Yetkililer yönetebilir
  if (isStaff(member, settings)) return true;
  
  // Ticket sahibi sadece kapatabilir (onaylı)
  return false;
}

module.exports = {
  isStaff,
  hasPermission,
  canModerate,
  botHasPermission,
  canAccessTicket,
  canManageTicket
};