import { pgTable, serial, text, varchar, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Usuários
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  clerkId: varchar('clerk_id', { length: 255 }).unique(), // Para integração com Clerk, se aplicável
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Eventos
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  date: timestamp('date').notNull(),
  location: varchar('location', { length: 255 }),
  organizerId: integer('organizer_id').references(() => users.id), // Chave estrangeira para users
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relações (opcional, mas bom para type safety com Drizzle)
export const usersRelations = relations(users, ({ many }) => ({
  organizedEvents: many(events, { relationName: 'organizedBy' }),
}));

export const eventsRelations = relations(events, ({ one })
 => ({
  organizer: one(users, {
    fields: [events.organizerId],
    references: [users.id],
    relationName: 'organizedBy',
  }),
}));

// Adicionaremos mais tabelas aqui depois (Financeiro, Fornecedores etc.)

// Contratos/Documentos
export const contracts = pgTable('contracts', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').references(() => events.id), // Pode ser nulo se o contrato não for específico de um evento
  title: varchar('title', { length: 255 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 100 }),
  fileSize: integer('file_size'), // em bytes
  filePath: varchar('file_path', { length: 1024 }).notNull(), // Ou fileKey para serviços de nuvem
  uploadedByUserId: varchar('uploaded_by_user_id', { length: 255 }), // Clerk User ID ou ID da sua tabela de usuários
  status: varchar('status', { length: 50 }).default('uploaded'), // ex: uploaded, pending_signature, signed, archived, cancelled, error_sending_to_provider
  signatureData: text('signature_data'), // Pode armazenar dados da assinatura digital, ou link para provedor
  signedAt: timestamp('signed_at'),
  // Campos para integração com Assinafy
  assinafyDocumentId: varchar('assinafy_document_id', { length: 255 }).unique(), // ID do documento no Assinafy
  assinafyStatus: varchar('assinafy_status', { length: 100 }), // Status do documento no Assinafy (ex: uploaded, metadata_ready, pending_signature, certificated)
  assinafyOriginalUrl: text('assinafy_original_url'), // URL do documento original no Assinafy
  assinafyCertificatedUrl: text('assinafy_certificated_url'), // URL do documento certificado no Assinafy
  assinafySignatureRequestId: varchar('assinafy_signature_request_id', {length: 255}), // ID do "assignment" ou processo de assinatura
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const contractsRelations = relations(contracts, ({ one }) => ({
  event: one(events, {
    fields: [contracts.eventId],
    references: [events.id],
  }),
  uploadedByUser: one(users, { // Assumindo que uploadedByUserId se refere à tabela users.id (ou clerkId)
    fields: [contracts.uploadedByUserId],
    references: [users.clerkId], // Mude para users.id se estiver usando o id serial da tabela users
    relationName: 'uploadedDocuments',
  })
}));

// Atualizar usersRelations para incluir contratos que um usuário subiu
export const usersRelationsUpdated = relations(users, ({ many }) => ({
  organizedEvents: many(events, { relationName: 'organizedBy' }),
  uploadedContracts: many(contracts, {relationName: 'uploadedDocuments'}),
  financialTransactions: many(financialTransactions, {relationName: 'userFinancialTransactions'})
}));

// Transações Financeiras
export const financialTransactions = pgTable('financial_transactions', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').references(() => events.id).notNull(), // Sempre ligada a um evento
  contractId: integer('contract_id').references(() => contracts.id), // Opcionalmente ligada a um contrato
  description: text('description').notNull(),
  type: varchar('type', { length: 50, enum: ['income', 'expense'] }).notNull(), // 'income' para entrada, 'expense' para saída
  amount: integer('amount').notNull(), // Armazenar como centavos para evitar problemas com ponto flutuante. Ex: R$ 100,50 = 10050
  transactionDate: timestamp('transaction_date', { mode: 'date' }).notNull().defaultNow(),
  notes: text('notes'),
  createdByUserId: varchar('created_by_user_id', { length: 255 }).notNull(), // Clerk User ID
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const financialTransactionsRelations = relations(financialTransactions, ({ one }) => ({
  event: one(events, {
    fields: [financialTransactions.eventId],
    references: [events.id],
  }),
  contract: one(contracts, {
    fields: [financialTransactions.contractId],
    references: [contracts.id],
  }),
  createdByUser: one(users, {
    fields: [financialTransactions.createdByUserId],
    references: [users.clerkId], // Assumindo que createdByUserId refere-se ao clerkId
    relationName: 'userFinancialTransactions'
  }),
}));

// Adicionar relação de eventos para transações financeiras
export const eventsRelationsUpdated = relations(events, ({ one, many }) => ({
  organizer: one(users, {
    fields: [events.organizerId],
    references: [users.id],
    relationName: 'organizedBy',
  }),
  contracts: many(contracts), // Se um evento pode ter muitos contratos
  financialTransactions: many(financialTransactions), // Um evento pode ter muitas transações
  eventSuppliers: many(eventSuppliers, { relationName: 'eventToSuppliers' }), // Relação de evento para fornecedores do evento
}));

// Categorias de Fornecedores (opcional, mas recomendado para consistência)
export const supplierCategories = pgTable('supplier_categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
});

// Fornecedores / Parceiros
export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  contactPerson: varchar('contact_person', { length: 255 }),
  email: varchar('email', { length: 255 }).unique(),
  phone: varchar('phone', { length: 50 }),
  // category: varchar('category', { length: 100 }), // Substituído por categoryId
  categoryId: integer('category_id').references(() => supplierCategories.id),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  category: one(supplierCategories, {
    fields: [suppliers.categoryId],
    references: [supplierCategories.id],
  }),
  eventSuppliers: many(eventSuppliers, { relationName: 'supplierToEvents' }), // Relação de fornecedor para eventos que participou
}));

// Tabela de Junção: Eventos <-> Fornecedores (Muitos para Muitos)
export const eventSuppliers = pgTable('event_suppliers', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').references(() => events.id).notNull(),
  supplierId: integer('supplier_id').references(() => suppliers.id).notNull(),
  // Campos adicionais para esta relação específica:
  roleInEvent: varchar('role_in_event', { length: 255 }), // Ex: "Buffet Principal", "Fotógrafo Cerimônia"
  contractDetails: text('contract_details'), // Poderia ser um link para um contrato na tabela 'contracts' ou detalhes resumidos
  // Outros campos como status de contratação, valores acordados específicos para este evento, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const eventSuppliersRelations = relations(eventSuppliers, ({ one }) => ({
  event: one(events, {
    fields: [eventSuppliers.eventId],
    references: [events.id],
    relationName: 'eventToSuppliers',
  }),
  supplier: one(suppliers, {
    fields: [eventSuppliers.supplierId],
    references: [suppliers.id],
    relationName: 'supplierToEvents',
  }),
}));


// Comunicação Log (para rastrear SMS, WhatsApp, Email enviados)
// export const communicationLogs = pgTable('communication_logs', {
//   id: serial('id').primaryKey(),
//   supplierId: integer('supplier_id').references(() => suppliers.id),
//   eventId: integer('event_id').references(() => events.id), // Opcional, se a comunicação for sobre um evento
//   channel: varchar('channel', { length: 50, enum: ['sms', 'whatsapp', 'email']}).notNull(),
//   recipient: varchar('recipient', { length: 255 }).notNull(), // Telefone ou email
//   messageTemplate: varchar('message_template', {length: 255}), // Nome/ID do template usado
//   messageContentSent: text('message_content_sent'), // Conteúdo real enviado (após preencher variáveis)
//   status: varchar('status', { length: 50 }).notNull(), // Ex: 'sent', 'delivered', 'read', 'failed', 'replied'
//   providerMessageId: varchar('provider_message_id', {length: 255}), // ID da mensagem no provedor (ex: Twilio SID, WhatsApp WAMID)
//   notes: text('notes'),
//   sentAt: timestamp('sent_at').defaultNow().notNull(),
//   lastUpdatedAt: timestamp('last_updated_at'), // Para status de entrega/leitura
// });

// console.log("Database schemas (users, events, contracts, financial_transactions, suppliers, event_suppliers, supplier_categories) defined.");
//   id: serial('id').primaryKey(),
//   name: varchar('name', { length: 255 }).notNull(),
//   contactName: varchar('contact_name', { length: 255 }),
//   email: varchar('email', { length: 255 }).unique(),
//   phone: varchar('phone', { length: 50 }),
//   category: varchar('category', { length: 100 }), // ex: Buffet, Decoração, Som/Luz
//   createdAt: timestamp('created_at').defaultNow().notNull(),
//   updatedAt: timestamp('updated_at').defaultNow().notNull(),
// });

console.log("Database schemas (users, events) defined.");
