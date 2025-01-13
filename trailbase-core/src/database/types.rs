#[derive(Clone, Debug, PartialEq)]
pub enum Value {
  /// The value is a `NULL` value.
  Null,
  /// The value is a signed integer.
  Integer(i64),
  /// The value is a floating point number.
  Real(f64),
  /// The value is a text string.
  Text(String),
  /// The value is a blob of data
  Blob(Vec<u8>),
}
