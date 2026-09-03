  // ---------------------------------------------------------------
  // Conexión Supabase
  // ---------------------------------------------------------------
  const SUPABASE_URL = "https://mtpcxuzlxvkmggojjrou.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10cGN4dXpseHZrbWdnb2pqcm91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNDA5NzMsImV4cCI6MjEwMzkxNjk3M30.Uv-yFYMtP6DBRl8QeGGXqT6V-JuM1YJFBEJMA6lBJWI";

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

