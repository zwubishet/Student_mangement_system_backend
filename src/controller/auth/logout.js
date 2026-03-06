import client from '../../hasuraClient.js';
import pkg from '@apollo/client';
const { gql } = pkg;

export const logout = async (req, res) => {
  console.log("🔥=== LOGOUT HANDLER ===");
  console.log("🔥 req.body:", req.body);
  
  // ✅ SAME DOUBLE-NESTING FIX as login!
  let finalInput = req.body.input?.input || req.body.input || req.body;
  const { token } = finalInput || {};
  
  console.log("✅ EXTRACTED TOKEN:", token ? `${token.slice(0,20)}...` : 'MISSING');

  // ✅ Input validation
  if (!token?.trim()) {
    return res.status(400).json({ 
      success: false,
      message: "Refresh token required for logout" 
    });
  }

  try {
    // ✅ Verify token exists first (security)
    const GET_REFRESH = gql`
      query GetRefresh($token: String!) {
        refresh_tokens(where: { token: { _eq: $token } }) {
          id
          user_id
        }
      }
    `;
    
    const verifyResp = await client.query({ 
      query: GET_REFRESH, 
      variables: { token: token.trim() }, 
      fetchPolicy: 'no-cache' 
    });

    if (!verifyResp.data.refresh_tokens?.[0]) {
      return res.status(404).json({ 
        success: false,
        message: "Refresh token not found" 
      });
    }

    // ✅ Delete refresh token
    const DELETE_REFRESH = gql`
      mutation DeleteRefresh($token: String!) {
        delete_refresh_tokens(where: { token: { _eq: $token } }) {
          affected_rows
        }
      }
    `;
    
    const result = await client.mutate({ 
      mutation: DELETE_REFRESH, 
      variables: { token: token.trim() } 
    });

    if (result.data.delete_refresh_tokens.affected_rows > 0) {
      console.log(`✅ Logout success: deleted token for user ${verifyResp.data.refresh_tokens[0].user_id}`);
      return res.status(200).json({ 
        success: true,
        message: "Logged out successfully" 
      });
    } else {
      return res.status(404).json({ 
        success: false,
        message: "Refresh token not found" 
      });
    }

  } catch (err) {
    console.error("Logout error:", {
      message: err.message,
      tokenPreview: token?.slice(0, 20) + '...'
    });
    
    return res.status(500).json({ 
      success: false,
      message: "Logout failed" 
    });
  }
};
