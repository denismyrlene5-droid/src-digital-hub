function pagination(input = {}, defaultPageSize = 12, maximumPageSize = 50) {
  const requestedPage = Number.parseInt(input.page, 10);
  const requestedSize = Number.parseInt(input.pageSize, 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = Number.isInteger(requestedSize) && requestedSize > 0
    ? Math.min(requestedSize, maximumPageSize)
    : defaultPageSize;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function metadata(total, page, pageSize) {
  const totalItems = Math.max(0, Number(total) || 0);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasPrevious: page > 1,
    hasNext: page < totalPages
  };
}

module.exports = { pagination, metadata };
