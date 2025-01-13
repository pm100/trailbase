use crate::database::params::NamedParams;
use axum::{extract::State, Json};
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::admin::AdminError as Error;
use crate::app_state::AppState;
use crate::auth::api::register::validate_and_normalize_email_address;
use crate::auth::password::hash_password;
use crate::auth::password::validate_passwords;
use crate::auth::user::DbUser;
use crate::auth::util::user_exists;
use crate::constants::{PASSWORD_OPTIONS, USER_TABLE, VERIFICATION_CODE_LENGTH};
use crate::email::Email;
use crate::rand::generate_random_string;

#[derive(Debug, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct CreateUserRequest {
  pub email: String,
  pub password: String,
  pub verified: bool,

  pub admin: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct CreateUserResponse {
  pub id: Uuid,
}

pub async fn create_user_handler(
  State(state): State<AppState>,
  Json(request): Json<CreateUserRequest>,
) -> Result<Json<CreateUserResponse>, Error> {
  let normalized_email = validate_and_normalize_email_address(&request.email)?;

  validate_passwords(&request.password, &request.password, &PASSWORD_OPTIONS)?;

  let exists = user_exists(&state, &normalized_email).await?;
  if exists {
    return Err(Error::AlreadyExists("user"));
  }

  let hashed_password = hash_password(&request.password)?;
  let email_verification_code = if request.verified {
    None
  } else {
    Some(generate_random_string(VERIFICATION_CODE_LENGTH))
  };

  lazy_static! {
    static ref INSERT_USER_QUERY: String = indoc::formatdoc!(
      r#"
        INSERT INTO '{USER_TABLE}'
          (email, password_hash, verified, admin, email_verification_code)
        VALUES
          (:email, :password_hash, :verified, :admin ,:email_verification_code)
        RETURNING *
     "#,
    );
  }

  let Some(user) = state
    .user_conn()
    .query_value::<DbUser>(
      &INSERT_USER_QUERY,
      named_params! {
        ":email": normalized_email,
        ":password_hash": hashed_password,
        ":verified": request.verified,
        ":admin": request.admin,
        ":email_verification_code": email_verification_code.clone(),
      },
    )
    .await?
  else {
    return Err(Error::Precondition("Internal".into()));
  };

  if let Some(email_verification_code) = email_verification_code {
    Email::verification_email(&state, &user, &email_verification_code)?
      .send()
      .await?;
  }

  return Ok(Json(CreateUserResponse {
    id: Uuid::from_bytes(user.id),
  }));
}

#[cfg(test)]
pub(crate) async fn create_user_for_test(
  state: &AppState,
  email: &str,
  password: &str,
) -> Result<Uuid, Error> {
  let response = create_user_handler(
    State(state.clone()),
    Json(CreateUserRequest {
      email: email.to_string(),
      password: password.to_string(),
      verified: true,
      admin: false,
    }),
  )
  .await?;

  return Ok(response.id);
}
