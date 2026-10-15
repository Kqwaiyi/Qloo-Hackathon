"use server";

import { redirect } from "next/navigation";

import { APP_HOME } from "@/config/routes";
import { type BirthDateFields, birthDateFieldsSchema } from "@/server/accounts/birth-date";
import { getOperationContext } from "@/server/app/context";
import { checkDateOfBirth, type SignUpInput, signUp, signUpInputSchema } from "@/server/operations/sign-up";

export async function checkDateOfBirthAction(fields: BirthDateFields) {
  return checkDateOfBirth(await getOperationContext(), birthDateFieldsSchema.parse(fields));
}

export async function signUpAction(input: SignUpInput) {
  const result = await signUp(await getOperationContext(), signUpInputSchema.parse(input));
  if (result.ok) redirect(APP_HOME);
  return result;
}
