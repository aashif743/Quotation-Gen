// Maps a company name to the prefix used for its quote/invoice numbers so each
// company keeps a separate, recognizable numbering series.
const PREFIX_MAP = {
  'Electronics Hub': 'EH',
  'Arkay Pak Investments': 'AP',
  'Arkay Pak': 'AP',
  'Community Marketing': 'CM',
  'Speed': 'SP',
};

function getCompanyPrefix(name) {
  if (!name) return 'QT';
  if (PREFIX_MAP[name]) return PREFIX_MAP[name];
  // Fallback: initials of the first two words, e.g. "Bright Sun" -> "BS".
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return initials || 'QT';
}

module.exports = { getCompanyPrefix };
