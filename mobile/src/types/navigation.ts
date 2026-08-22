import type { NavigatorScreenParams } from "@react-navigation/native";

export type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Work: NavigatorScreenParams<WorkStackParamList> | undefined;
  FollowUps: undefined;
  Pipeline: undefined;
  Profile: undefined;
};

export type WorkStackParamList = {
  WorkList: undefined;
  TicketDetail: { ticketId: string; companyName?: string };
};
