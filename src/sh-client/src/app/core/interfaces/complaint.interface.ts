export type ComplaintStatus = 'open' | 'pending' | 'reviewed' | 'resolved' | 'rejected' | string;

export type ComplaintRecord = {
  id: string;
  _id?: string;
  userId: string;
  title: string;
  message: string;
  status: ComplaintStatus;
  adminResponse?: string;
  createdAt: string;
  updatedAt?: string;
};

export type CreateComplaintPayload = {
  title: string;
  message: string;
};
