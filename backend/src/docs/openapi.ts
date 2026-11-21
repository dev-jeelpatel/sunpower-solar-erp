// OpenAPI 3 description served by Swagger UI at /api/docs.
// Paths are registered per module with `doc()` so the spec grows with the code.
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Op = { tag: string; summary: string; auth?: boolean; body?: Record<string, string> };

const paths: Record<string, Record<string, unknown>> = {};

export function doc(method: Method, path: string, op: Op) {
  const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'integer' } }));
  paths[path] ??= {};
  paths[path][method] = {
    tags: [op.tag],
    summary: op.summary,
    ...(op.auth === false ? {} : { security: [{ bearerAuth: [] }] }),
    ...(params.length ? { parameters: params } : {}),
    ...(op.body
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', properties: Object.fromEntries(Object.entries(op.body).map(([k, t]) => [k, { type: t }])) },
              },
            },
          },
        }
      : {}),
    responses: {
      '200': { description: 'OK' },
      '400': { description: 'Validation error: { error, fields: { field: message } }' },
      '401': { description: 'Not signed in' },
      '403': { description: 'Role not allowed' },
      '422': { description: 'Business rule violated' },
    },
  };
}

// ---- Auth & staff
doc('post', '/auth/login', { tag: 'Auth', summary: 'Sign in, returns a JWT', auth: false, body: { email: 'string', password: 'string' } });
doc('get', '/auth/me', { tag: 'Auth', summary: 'Current user' });
doc('get', '/users', { tag: 'Staff', summary: 'List active staff (?role=technician)' });
doc('get', '/users/all', { tag: 'Staff', summary: 'All staff incl. disabled (admin)' });
doc('post', '/users', { tag: 'Staff', summary: 'Create staff member (admin)', body: { name: 'string', email: 'string', password: 'string', role: 'string' } });
doc('patch', '/users/{id}', { tag: 'Staff', summary: 'Update / disable staff member (admin)' });

// ---- Sales pipeline
doc('post', '/public/enquiries', {
  tag: 'Enquiries', summary: 'Website enquiry form (no login, rate limited)', auth: false,
  body: { name: 'string', phone: 'string', email: 'string', address: 'string', requestedKw: 'number', systemType: 'string' },
});
doc('get', '/enquiries', { tag: 'Enquiries', summary: 'List enquiries (?status, ?q, ?page)' });
doc('post', '/enquiries', { tag: 'Enquiries', summary: 'Create enquiry from a call / WhatsApp / walk-in' });
doc('get', '/enquiries/{id}', { tag: 'Enquiries', summary: 'Enquiry with surveys, quotes and activity' });
doc('post', '/enquiries/{id}/qualify', { tag: 'Enquiries', summary: 'Log the phone check and decide' });
doc('post', '/enquiries/{id}/assign', { tag: 'Enquiries', summary: 'Reassign to a salesperson' });

export const openApiSpec = {
  openapi: '3.0.3',
  info: { title: 'SunPower Solar ERP API', version: '1.0.0', description: 'Enquiry-to-warranty platform for a rooftop solar installer.' },
  servers: [{ url: '/api' }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  paths,
};
